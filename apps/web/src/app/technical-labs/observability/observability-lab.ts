import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { InstantPipe, NumberPipe } from '../../core/i18n/locale-pipes';
import { LOG_INSPECTION } from '../../core/logging/log-inspection';
import { PERFORMANCE_BUDGETS } from '../../core/observability/performance-budgets';
import { PerformanceMonitor } from '../../core/observability/performance-monitor';
import type { Instant } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { Table } from '../../shared/ui/table/table';
import { LabSection } from '../lab-section';

/** The log is long; a lab page shows its tail. */
const LOG_ROWS = 25;

/**
 * What the application measures and logs about itself, shown live
 * (docs/observability.md).
 *
 * Nothing here is lab-only machinery: the monitor and the log are the ones
 * the whole application writes to, and this page only reads them. Use the
 * application in another tab of the same window - or navigate away and back -
 * and the numbers here are those visits.
 *
 * The log panel works only in builds with developer tooling. The in-memory
 * sink it reads is a build-time flag (ADR-0040): a production build does not
 * contain it, and the page says so instead of showing an empty table.
 */
@Component({
  selector: 'app-observability-lab',
  imports: [
    Button,
    InstantPipe,
    LabSection,
    NumberPipe,
    PageContainer,
    PageHeader,
    Table,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.observability'">
      <app-page-header [heading]="t('heading')" [description]="t('lede')" />

      <app-lab-section
        sectionId="initial-load"
        [heading]="t('load.heading')"
        [description]="t('load.description')"
      >
        @if (monitor.initialLoad(); as load) {
          <dl class="facts" data-testid="initial-load">
            @for (metric of loadMetrics(); track metric.key) {
              <div>
                <dt>{{ t('load.' + metric.key) }}</dt>
                <dd [class.over]="metric.over">
                  @if (metric.value === null) {
                    {{ t('notMeasured') }}
                  } @else {
                    {{ t('milliseconds', { value: (metric.value | appNumber) }) }}
                  }
                </dd>
                <dd class="budget">
                  {{ t('budget', { value: (metric.budget | appNumber) }) }}
                </dd>
              </div>
            }
          </dl>
        } @else {
          <p role="status">{{ t('load.pending') }}</p>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="navigation"
        [heading]="t('navigation.heading')"
        [description]="
          t('navigation.description', { budget: (budgets.routeNavigationMs | appNumber) })
        "
      >
        @if (monitor.navigations().length === 0) {
          <p>{{ t('navigation.empty') }}</p>
        } @else {
          <app-table [caption]="t('navigation.caption')">
            <table data-testid="navigations">
              <caption class="visually-hidden">
                {{
                  t('navigation.caption')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('navigation.route') }}</th>
                  <th scope="col">{{ t('duration') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (row of monitor.navigations(); track $index) {
                  <tr>
                    <td>{{ row.route }}</td>
                    <td [class.over]="row.durationMs > budgets.routeNavigationMs">
                      {{ t('milliseconds', { value: (row.durationMs | appNumber) }) }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </app-table>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="api-latency"
        [heading]="t('api.heading')"
        [description]="t('api.description', { budget: (budgets.apiCallMs | appNumber) })"
      >
        <app-table [caption]="t('api.caption')">
          <table data-testid="api-latency">
            <caption class="visually-hidden">
              {{
                t('api.caption')
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ t('api.endpoint') }}</th>
                <th scope="col">{{ t('api.count') }}</th>
                <th scope="col">{{ t('api.p50') }}</th>
                <th scope="col">{{ t('api.p95') }}</th>
                <th scope="col">{{ t('api.max') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of apiLatency(); track row.endpoint) {
                <tr>
                  <td>{{ row.endpoint }}</td>
                  <td>{{ row.count | appNumber }}</td>
                  <td>{{ t('milliseconds', { value: (row.p50Ms | appNumber) }) }}</td>
                  <td [class.over]="row.p95Ms > budgets.apiCallMs">
                    {{ t('milliseconds', { value: (row.p95Ms | appNumber) }) }}
                  </td>
                  <td>{{ t('milliseconds', { value: (row.maxMs | appNumber) }) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </app-table>
      </app-lab-section>

      <app-lab-section
        sectionId="long-tasks"
        [heading]="t('longTasks.heading')"
        [description]="t('longTasks.description', { budget: (budgets.longTaskMs | appNumber) })"
      >
        @if (monitor.supports('longtask')) {
          <dl class="facts" data-testid="long-tasks">
            <div>
              <dt>{{ t('longTasks.count') }}</dt>
              <dd>{{ monitor.longTasks().count | appNumber }}</dd>
            </div>
            <div>
              <dt>{{ t('longTasks.total') }}</dt>
              <dd>{{ t('milliseconds', { value: (monitor.longTasks().totalMs | appNumber) }) }}</dd>
            </div>
            <div>
              <dt>{{ t('longTasks.longest') }}</dt>
              <dd [class.over]="monitor.longTasks().longestMs > budgets.longTaskMs">
                {{ t('milliseconds', { value: (monitor.longTasks().longestMs | appNumber) }) }}
              </dd>
            </div>
          </dl>
        } @else {
          <p>{{ t('longTasks.unsupported') }}</p>
        }
      </app-lab-section>

      <app-lab-section
        sectionId="log"
        [heading]="t('log.heading')"
        [description]="t('log.description')"
      >
        @if (log; as sink) {
          <div class="actions">
            <app-button variant="secondary" (click)="throwUnhandled()">
              {{ t('log.throw') }}
            </app-button>
            <app-button variant="ghost" (click)="sink.clear()">{{ t('log.clear') }}</app-button>
          </div>
          <app-table [caption]="t('log.caption')">
            <table data-testid="log">
              <caption class="visually-hidden">
                {{
                  t('log.caption')
                }}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{{ t('log.time') }}</th>
                  <th scope="col">{{ t('log.level') }}</th>
                  <th scope="col">{{ t('log.message') }}</th>
                  <th scope="col">{{ t('log.correlationId') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of latest(); track $index) {
                  <tr [attr.data-level]="entry.level">
                    <td>{{ entry.timestamp | appInstant: 'timeWithSeconds' }}</td>
                    <td>{{ entry.level }}</td>
                    <td>{{ entry.message }}</td>
                    <td class="mono">{{ entry.correlationId ?? '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </app-table>
        } @else {
          <p data-testid="log-unavailable">{{ t('log.unavailable') }}</p>
        }
      </app-lab-section>
    </app-page-container>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      gap: var(--space-3);
      margin: 0;
    }

    .facts dt,
    .budget {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .facts dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
    }

    .over {
      color: var(--danger-text);
      font-weight: var(--weight-semibold);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .mono {
      font-family: var(--font-mono);
      font-size: var(--text-xs);
    }
  `,
})
export class ObservabilityLab {
  protected readonly monitor = inject(PerformanceMonitor);
  protected readonly budgets = PERFORMANCE_BUDGETS;
  /** `null` in a production build: the in-memory log is developer tooling. */
  protected readonly log = inject(LOG_INSPECTION);

  protected readonly apiLatency = computed(() => this.monitor.apiLatency());

  protected readonly latest = computed(() =>
    (this.log?.entries() ?? [])
      .slice(-LOG_ROWS)
      .reverse()
      .map((entry) => ({
        ...entry,
        timestamp: entry.timestamp as Instant,
        correlationId: typeof entry['correlationId'] === 'string' ? entry['correlationId'] : null,
      })),
  );

  protected readonly loadMetrics = computed(() => {
    const load = this.monitor.initialLoad();
    const metric = (
      key: 'timeToFirstByteMs' | 'firstContentfulPaintMs' | 'largestContentfulPaintMs',
    ) => {
      const value = load?.[key] ?? null;
      const budget = PERFORMANCE_BUDGETS[key];
      return { key, value, budget, over: value !== null && value > budget };
    };
    return [
      metric('timeToFirstByteMs'),
      metric('firstContentfulPaintMs'),
      metric('largestContentfulPaintMs'),
    ];
  });

  /**
   * Throws from an event handler, as a bug would. Angular hands it to the
   * `ErrorHandler`, which reports it through the error tracker - with the
   * steps that led here as breadcrumbs. The log table shows the report.
   */
  protected throwUnhandled(): void {
    throw new Error('Deliberate error from the observability lab');
  }
}
