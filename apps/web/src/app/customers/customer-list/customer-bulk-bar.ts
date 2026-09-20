import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { BulkResponse } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { Button } from '../../shared/ui/button/button';
import { bulkFailureKey } from '../customer-vocabulary';

/** One failure reason and how many records hit it. */
interface FailureGroup {
  readonly messageKey: string;
  readonly count: number;
}

/**
 * The bar that appears when rows are selected, and the report that appears
 * after a bulk action runs.
 *
 * The report is the reason this component exists rather than a toast. A bulk
 * request is not one operation: the server answers per item, and 18 of 20 is
 * the normal outcome rather than the edge case. Collapsing that into "done" or
 * "failed" would force the user to re-check twenty records by hand to find out
 * what actually happened - so the failures are grouped by reason and counted,
 * and the page keeps the failed rows selected so the user can retry exactly
 * those.
 *
 * `role="status"` on the report, so the outcome is announced to a screen-reader
 * user who cannot see the bar change. Not `alert`: a partial success is
 * information, not an emergency, and `alert` interrupts whatever is being read.
 */
@Component({
  selector: 'app-customer-bulk-bar',
  imports: [Button, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bulk" *transloco="let t">
      <div class="bulk__row">
        <p class="bulk__count" data-testid="selection-count">
          {{ t('pages.customers.list.bulk.selected', { count: count() }) }}
        </p>

        <div class="bulk__actions">
          <app-button
            size="sm"
            [loading]="running()"
            [disabled]="running()"
            (click)="activate.emit()"
            data-testid="bulk-activate"
          >
            {{ t('pages.customers.list.bulk.activate') }}
          </app-button>
          <app-button
            size="sm"
            [loading]="running()"
            [disabled]="running()"
            (click)="deactivate.emit()"
            data-testid="bulk-deactivate"
          >
            {{ t('pages.customers.list.bulk.deactivate') }}
          </app-button>
          <app-button
            size="sm"
            variant="danger"
            [loading]="running()"
            [disabled]="running()"
            (click)="remove.emit()"
            data-testid="bulk-delete"
          >
            {{ t('pages.customers.list.bulk.delete') }}
          </app-button>
          <app-button size="sm" variant="ghost" (click)="clear.emit()">
            {{ t('pages.customers.list.bulk.clear') }}
          </app-button>
        </div>
      </div>

      @if (result(); as report) {
        <div class="bulk__report" role="status" data-testid="bulk-report">
          <p>
            {{
              t('pages.customers.list.bulk.summary', {
                succeeded: report.succeeded,
                requested: report.requested,
              })
            }}
          </p>

          @if (failures().length > 0) {
            <ul class="bulk__failures">
              @for (failure of failures(); track failure.messageKey) {
                <li>{{ t(failure.messageKey, { count: failure.count }) }}</li>
              }
            </ul>
            <p class="bulk__retry-hint">{{ t('pages.customers.list.bulk.retryHint') }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .bulk {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--accent);
      border-radius: var(--radius-lg);
      background-color: var(--accent-subtle);
    }

    .bulk__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .bulk__count {
      font-weight: var(--weight-medium);
    }

    .bulk__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .bulk__report {
      padding-top: var(--space-2);
      border-top: var(--border-width) solid var(--border-subtle);
      font-size: var(--text-sm);
    }

    .bulk__failures {
      margin: var(--space-1) 0 0;
      padding-left: var(--space-5);
      color: var(--danger-text);
    }

    .bulk__retry-hint {
      margin-top: var(--space-1);
      color: var(--text-secondary);
    }

    @media #{bp.$below-tablet} {
      .bulk__actions {
        width: 100%;
      }
    }
  `,
})
export class CustomerBulkBar {
  readonly count = input.required<number>();
  readonly running = input(false);
  /** The last run's per-item outcome, or null when there has not been one. */
  readonly result = input<BulkResponse | null>(null);

  readonly activate = output<void>();
  readonly deactivate = output<void>();
  readonly remove = output<void>();
  readonly clear = output<void>();

  /**
   * Failures grouped by reason.
   *
   * A list of twenty identical sentences is not a report. What a user can act
   * on is "3 were changed by someone else, 1 no longer exists" - two different
   * problems with two different answers.
   */
  protected readonly failures = computed<readonly FailureGroup[]>(() => {
    const report = this.result();
    if (!report) {
      return [];
    }

    const counts = new Map<string, number>();
    for (const item of report.results) {
      if (item.outcome === 'FAILED') {
        const key = bulkFailureKey(item.errorCode);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...counts].map(([messageKey, count]) => ({ messageKey, count }));
  });
}
