import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import type { AuditEntry } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { parseCustomerId } from '../data/customer-id';
import { CustomerStore } from '../state/customer-store';
import { valueOf } from '../state/remote-data';

/**
 * A customer's audit trail, newest first.
 *
 * It is a sibling route of the detail page rather than a tab inside it,
 * because the audit trail is a place a user can be sent to:
 * `/customers/:id/audit` is a link, a bookmark and a history entry. A tab held
 * in a component signal is none of those.
 *
 * Two details about how it renders the data it is given:
 *
 *  - **the action is a translation key**, not the server's enum member. The
 *    API sends `CUSTOMER_STATUS_CHANGED`; a user reads a sentence.
 *  - **field values are shown exactly as recorded**. The audit log stores what
 *    a field was and became as strings, and formatting them would be guessing
 *    at a type the entry does not carry - and would quietly rewrite history
 *    the first time a format changed.
 */
/** Fields that have a translated label in `customers.field.*`. */
const AUDITED_FIELDS = new Set([
  'fullName',
  'email',
  'phone',
  'dateOfBirth',
  'gender',
  'status',
  'address',
  'tags',
  'avatarUrl',
]);

@Component({
  selector: 'app-customer-audit-page',
  imports: [
    Button,
    DatePipe,
    EmptyState,
    ErrorState,
    PageContainer,
    PageHeader,
    Skeleton,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.audit.heading')"
        [description]="t('pages.customers.audit.description')"
      >
        <div pageActions>
          <app-button
            variant="secondary"
            [loading]="pending()"
            (click)="refresh()"
            data-testid="refresh-audit"
          >
            {{ t('pages.customers.audit.refresh') }}
          </app-button>
          <app-button [link]="['/customers', id()]">
            {{ t('pages.customers.audit.backToCustomer') }}
          </app-button>
        </div>
      </app-page-header>

      @switch (view()) {
        @case ('loading') {
          <app-skeleton [lines]="6" />
          <p class="visually-hidden" role="status">{{ t('pages.customers.audit.loading') }}</p>
        }

        @case ('missing') {
          <app-error-state
            [heading]="t('pages.customers.detail.notFoundHeading')"
            [description]="t('pages.customers.detail.notFoundBody')"
            data-testid="audit-not-found"
          />
        }

        @case ('error') {
          <app-error-state
            [heading]="t('pages.customers.audit.errorHeading')"
            [description]="t(errorMessageKey())"
            [retryLabel]="t('common.retry')"
            (retry)="refresh()"
            data-testid="audit-error"
          />
        }

        @case ('empty') {
          <app-empty-state
            [heading]="t('pages.customers.audit.emptyHeading')"
            [description]="t('pages.customers.audit.emptyBody')"
            data-testid="audit-empty"
          />
        }

        @case ('entries') {
          <ol class="trail" data-testid="audit-entries">
            @for (entry of entries(); track entry.id) {
              <li class="entry">
                <p class="entry__action">{{ t(actionKey(entry)) }}</p>
                <p class="entry__meta">
                  {{
                    t('pages.customers.audit.by', {
                      actor: entry.actorDisplayName,
                    })
                  }}
                  <time [attr.datetime]="entry.occurredAt">
                    {{ entry.occurredAt | date: 'medium' }}
                  </time>
                </p>

                @if (entry.changes.length) {
                  <ul class="changes">
                    @for (change of entry.changes; track change.field) {
                      <li data-testid="audit-change">
                        <span class="changes__field">{{ t(fieldKey(change.field)) }}</span>
                        @if (change.redacted) {
                          <!-- The server withheld both values (ADR-0019's
                               sibling rule: what is not needed is not sent).
                               Saying so beats an empty cell that reads as
                               "was blank, is blank". -->
                          <span class="changes__redacted" data-testid="audit-redacted">{{
                            t('pages.customers.audit.redacted')
                          }}</span>
                        } @else if (change.previousValue === null && change.newValue === null) {
                          <span class="changes__redacted">{{
                            t('pages.customers.audit.changedNoValue')
                          }}</span>
                        } @else {
                          <span class="changes__value">{{
                            change.previousValue ?? t('common.notProvided')
                          }}</span>
                          <span class="changes__arrow" aria-hidden="true"></span>
                          <span class="visually-hidden">{{
                            t('pages.customers.audit.becameSr')
                          }}</span>
                          <span class="changes__value">{{
                            change.newValue ?? t('common.notProvided')
                          }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </li>
            }
          </ol>
        }
      }
    </app-page-container>
  `,
  styles: `
    .trail {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .entry {
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .entry__action {
      font-weight: var(--weight-medium);
    }

    .entry__meta {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .changes {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: var(--space-3) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--text-sm);
    }

    .changes li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-2);
    }

    .changes__field {
      min-width: 8rem;
      color: var(--text-secondary);
    }

    .changes__redacted {
      color: var(--text-secondary);
      font-style: italic;
    }

    .changes__value {
      font-family: var(--font-mono);
      word-break: break-word;
    }

    /* Drawn from CSS: a glyph in the template is a text node, and the
       screen-reader wording next to it is a translation instead. */
    .changes__arrow::before {
      content: '\\2192';
    }
  `,
})
export class CustomerAuditPage {
  /**
   * The label for a changed field. A field the vocabulary knows is shown by
   * its translated name; one it does not - a field added to the API later -
   * falls back to a generic label rather than the raw property name.
   */
  protected fieldKey(field: string): string {
    return AUDITED_FIELDS.has(field)
      ? `customers.field.${field}`
      : 'pages.customers.audit.otherField';
  }

  readonly id = input.required<string>();

  private readonly store = inject(CustomerStore);

  private readonly customerId = computed(() => parseCustomerId(this.id()));
  private readonly state = this.store.audit;

  protected readonly entries = computed(() => valueOf(this.state()) ?? []);
  protected readonly pending = computed(
    () => this.state().status === 'loading' || this.state().status === 'refreshing',
  );

  protected readonly view = computed<'loading' | 'missing' | 'error' | 'empty' | 'entries'>(() => {
    if (this.customerId() === null) {
      return 'missing';
    }
    const state = this.state();
    if (state.status === 'idle' || state.status === 'loading') {
      return 'loading';
    }
    if (state.status === 'error' && state.value === null) {
      return state.error.kind === 'not-found' ? 'missing' : 'error';
    }
    return this.entries().length === 0 ? 'empty' : 'entries';
  });

  protected readonly errorMessageKey = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.messageKey : 'errors.unknown';
  });

  constructor() {
    effect(() => {
      const id = this.customerId();
      if (id) {
        this.store.selectAuditTrail(id);
      }
    });
  }

  protected refresh(): void {
    this.store.refreshAuditTrail();
  }

  protected actionKey(entry: AuditEntry): string {
    return `customers.audit.action.${entry.action}`;
  }
}
