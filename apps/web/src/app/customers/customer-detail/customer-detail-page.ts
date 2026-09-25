import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import type { Customer } from '@ecm/contracts';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { IfPermitted } from '../../core/auth/if-permitted.directive';
import { isAppError, messageKeyOf } from '../../core/errors/app-error';
import { NotificationService } from '../../core/notifications/notification.service';
import { formatDateOnly } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Badge } from '../../shared/ui/badge/badge';
import { Button } from '../../shared/ui/button/button';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import { CustomerAvatar } from '../customer-avatar/customer-avatar';
import { parseCustomerId } from '../data/customer-id';
import { genderLabelKey, statusLabelKey, statusTone } from '../customer-vocabulary';
import { CustomerStore } from '../state/customer-store';
import { valueOf } from '../state/remote-data';

/**
 * One customer.
 *
 * The page is a deep link: `id` arrives from the route, so arriving from the
 * list, from a bookmark or from a reload are the same thing to this component.
 * An id that is not a well-formed identifier is answered here rather than by
 * the server - `/customers/nonsense` renders "not found" without a request
 * that was always going to fail.
 *
 * Deleting is the one destructive action in the feature, and it is the reason
 * this page owns a dialog. Three things happen in order, and each is visible:
 * confirm, then a request with the button in its busy state, then a navigation
 * back to the list - whose cache the store has already invalidated, so the
 * record is gone from it rather than lingering until the next reload.
 */
@Component({
  selector: 'app-customer-detail-page',
  imports: [
    Badge,
    Button,
    CustomerAvatar,
    DatePipe,
    Dialog,
    ErrorState,
    IfPermitted,
    PageContainer,
    PageHeader,
    Skeleton,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="customer()?.fullName ?? t('pages.customers.detail.heading')"
        [description]="t('pages.customers.detail.description')"
      >
        <div pageActions>
          @if (customer(); as record) {
            <app-button
              variant="secondary"
              [loading]="pending()"
              (click)="refresh()"
              data-testid="refresh-detail"
            >
              {{ t('pages.customers.detail.refresh') }}
            </app-button>
            <!-- UI authorization: an action the user can never perform is
                 not offered. The store refuses it too, and the API refuses it
                 regardless - this is the part a user sees, not the part that
                 protects anything. MANAGER is the role that shows it: edit
                 without delete. -->
            <app-button
              *appIfPermitted="'CUSTOMER_UPDATE'"
              [link]="['/customers', record.id, 'edit']"
            >
              {{ t('pages.customers.detail.edit') }}
            </app-button>
            <app-button [link]="['/customers', record.id, 'audit']">
              {{ t('pages.customers.detail.audit') }}
            </app-button>
            <app-button
              *appIfPermitted="'CUSTOMER_UPDATE'"
              variant="secondary"
              [disabled]="statusChanging()"
              (click)="toggleStatus(record)"
              data-testid="toggle-status"
            >
              {{
                record.status === 'ACTIVE'
                  ? t('pages.customers.detail.deactivate')
                  : t('pages.customers.detail.activate')
              }}
            </app-button>
            <app-button
              *appIfPermitted="'CUSTOMER_DELETE'"
              variant="danger"
              (click)="confirmingDelete.set(true)"
            >
              {{ t('pages.customers.detail.delete') }}
            </app-button>
          }
          <app-button variant="ghost" link="/customers">
            {{ t('pages.customers.detail.backToList') }}
          </app-button>
        </div>
      </app-page-header>

      @switch (view()) {
        @case ('loading') {
          <app-skeleton [lines]="6" />
          <p class="visually-hidden" role="status">{{ t('pages.customers.detail.loading') }}</p>
        }

        @case ('missing') {
          <app-error-state
            [heading]="t('pages.customers.detail.notFoundHeading')"
            [description]="t('pages.customers.detail.notFoundBody')"
            data-testid="detail-not-found"
          />
        }

        @case ('error') {
          <app-error-state
            [heading]="t('pages.customers.detail.errorHeading')"
            [description]="t(errorMessageKey())"
            [retryLabel]="t('common.retry')"
            (retry)="refresh()"
            data-testid="detail-error"
          />
        }

        @case ('record') {
          @if (customer(); as record) {
            @if (staleness(); as why) {
              <!-- News from the realtime stream. The record below is left as
                   it is - replacing it under the reader is worse than saying
                   it may be out of date - and one click brings it current. -->
              <div class="stale" role="status" data-testid="stale-record">
                <p>{{ t('pages.customers.detail.stale.' + why, { code: record.customerCode }) }}</p>
                @if (why === 'deleted') {
                  <app-button size="sm" link="/customers">
                    {{ t('pages.customers.detail.backToList') }}
                  </app-button>
                } @else {
                  <app-button size="sm" (click)="refresh()" data-testid="stale-refresh">
                    {{ t('pages.customers.detail.refresh') }}
                  </app-button>
                }
              </div>
            }

            <app-customer-avatar [customer]="record" />

            <dl class="facts" data-testid="customer-facts">
              <div class="fact">
                <dt>{{ t('customers.field.customerCode') }}</dt>
                <dd data-testid="customer-code">{{ record.customerCode }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.status') }}</dt>
                <dd>
                  <app-badge [tone]="tone(record)" data-testid="status-badge">{{
                    t(statusKey(record))
                  }}</app-badge>
                  @if (statusChanging()) {
                    <span class="saving" role="status">{{
                      t('pages.customers.detail.statusSaving')
                    }}</span>
                  }
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.email') }}</dt>
                <dd>{{ record.email }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.phone') }}</dt>
                <dd>{{ record.phone || t('common.notProvided') }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.dateOfBirth') }}</dt>
                <dd>{{ dateOfBirth(record) || t('common.notProvided') }}</dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.gender') }}</dt>
                <dd>{{ t(genderKey(record)) }}</dd>
              </div>
              <div class="fact fact--wide">
                <dt>{{ t('customers.field.address') }}</dt>
                <dd>{{ address(record) || t('common.notProvided') }}</dd>
              </div>
              <div class="fact fact--wide">
                <dt>{{ t('customers.field.tags') }}</dt>
                <dd>
                  @if (record.tags.length) {
                    <ul class="tags">
                      @for (tag of record.tags; track tag) {
                        <li>
                          <app-badge>{{ tag }}</app-badge>
                        </li>
                      }
                    </ul>
                  } @else {
                    {{ t('common.notProvided') }}
                  }
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.createdAt') }}</dt>
                <dd>
                  <time [attr.datetime]="record.createdAt">
                    {{ record.createdAt | date: 'medium' }}
                  </time>
                </dd>
              </div>
              <div class="fact">
                <dt>{{ t('customers.field.updatedAt') }}</dt>
                <dd>
                  <time [attr.datetime]="record.updatedAt">
                    {{ record.updatedAt | date: 'medium' }}
                  </time>
                </dd>
              </div>
            </dl>
          }
        }
      }

      <app-dialog
        [open]="confirmingDelete()"
        [heading]="t('pages.customers.detail.deleteHeading')"
        (closed)="confirmingDelete.set(false)"
      >
        <p>{{ t('pages.customers.detail.deleteBody', { name: customer()?.fullName ?? '' }) }}</p>
        @if (deleteError()) {
          <p class="delete-error" role="alert">{{ t(deleteError() ?? '') }}</p>
        }

        <div dialogActions>
          <app-button [disabled]="deleting()" (click)="confirmingDelete.set(false)">
            {{ t('common.cancel') }}
          </app-button>
          <app-button
            variant="danger"
            [loading]="deleting()"
            (click)="deleteCustomer()"
            data-testid="confirm-delete"
          >
            {{ t('pages.customers.detail.delete') }}
          </app-button>
        </div>
      </app-dialog>
    </app-page-container>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .stale {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-4);
      padding: var(--space-3);
      border: var(--border-width) solid var(--warning);
      border-radius: var(--radius-md);
      background-color: var(--warning-subtle);
      color: var(--warning-text);
    }

    .stale p {
      margin: 0;
    }

    .saving {
      margin-inline-start: var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    app-customer-avatar {
      display: block;
      margin-bottom: var(--space-4);
    }

    .facts {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
      margin: 0;
      padding: var(--space-5);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .fact dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-medium);
    }

    .fact dd {
      margin: var(--space-1) 0 0;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .delete-error {
      margin-top: var(--space-3);
      color: var(--danger-text);
    }

    @media #{bp.$tablet-up} {
      .facts {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .fact--wide {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class CustomerDetailPage {
  /** Bound from the `:id` route parameter. */
  readonly id = input.required<string>();

  private readonly store = inject(CustomerStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);

  private readonly customerId = computed(() => parseCustomerId(this.id()));
  private readonly state = this.store.detail;

  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly customer = computed(() => valueOf(this.state()));
  protected readonly pending = computed(
    () => this.state().status === 'loading' || this.state().status === 'refreshing',
  );

  protected readonly staleness = this.store.detailStaleness;
  protected readonly statusChanging = computed(() => {
    const id = this.customerId();
    return id !== null && this.store.statusPending().has(id);
  });

  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  /**
   * Which rendering the page shows.
   *
   * `missing` covers both a malformed id and a 404, because they are the same
   * answer to the user: there is no such customer. The distinction matters to
   * the log, not to the page.
   */
  protected readonly view = computed<'loading' | 'missing' | 'error' | 'record'>(() => {
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
    return 'record';
  });

  protected readonly errorMessageKey = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.messageKey : 'errors.unknown';
  });

  constructor() {
    effect(() => {
      const id = this.customerId();
      if (id) {
        this.store.selectCustomer(id);
      }
    });
  }

  protected refresh(): void {
    this.store.refreshDetail();
  }

  protected tone(record: Customer) {
    return statusTone(record.status);
  }

  protected statusKey(record: Customer): string {
    return statusLabelKey(record.status);
  }

  protected genderKey(record: Customer): string {
    return genderLabelKey(record.gender);
  }

  /** A calendar date, rendered without ever becoming a moment in time. */
  protected dateOfBirth(record: Customer): string {
    return record.dateOfBirth ? formatDateOnly(record.dateOfBirth, this.activeLang()) : '';
  }

  /** One line, skipping the parts this customer does not have. */
  protected address(record: Customer): string {
    const address = record.address;
    if (!address) {
      return '';
    }
    return [address.line1, address.line2, address.city, address.postalCode, address.country]
      .filter(Boolean)
      .join(', ');
  }

  /**
   * Activates or deactivates, optimistically: the badge changes at once and
   * the server confirms it. If the server refuses, the store has already put
   * the old status back, and the user is told - loudly, because the change
   * they saw happen did not. A 409 means someone else changed the record, so
   * it is reloaded as well. ADR-0023.
   */
  protected toggleStatus(record: Customer): void {
    const next = record.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.store
      .changeStatus(record.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          const conflict = isAppError(error) && error.kind === 'conflict';
          this.notifications.toast(
            conflict
              ? 'pages.customers.detail.statusConflict'
              : 'pages.customers.detail.statusRolledBack',
            { tone: 'danger', params: { reason: this.transloco.translate(messageKeyOf(error)) } },
          );
          if (conflict) {
            this.store.refreshDetail();
          }
        },
      });
  }

  protected deleteCustomer(): void {
    const id = this.customerId();
    if (!id || this.deleting()) {
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);

    this.store
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.confirmingDelete.set(false);
          // Back to the list, which the store has already invalidated: the
          // record is gone from it rather than reappearing until a reload.
          void this.router.navigate(['/customers']);
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          // The dialog stays open and says what happened. Closing it on
          // failure would leave the user looking at a record that is still
          // there with no explanation of why.
          this.deleteError.set(messageKeyOf(error));
        },
      });
  }
}
