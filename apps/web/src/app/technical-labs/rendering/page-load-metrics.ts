import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { WINDOW } from '../../core/platform/platform.tokens';

/** Set by `main.ts` once the application is stable - hydrated, or rendered, and idle. */
export const APP_STABLE_MARK = 'ecm:app-stable';
/** Set by `main.ts` just before `bootstrapApplication`. */
export const BOOTSTRAP_START_MARK = 'ecm:bootstrap-start';

/** One page load, in milliseconds from navigation start, and bytes. */
export interface PageLoad {
  readonly ttfb: number | null;
  readonly fcp: number | null;
  readonly lcp: number | null;
  /** When the application became stable - interactive, with nothing pending. */
  readonly appStable: number | null;
  /** From `bootstrapApplication` to stable: hydration, or client rendering. */
  readonly bootstrapToStable: number | null;
  readonly htmlBytes: number | null;
  readonly totalBytes: number | null;
}

/**
 * Reads this page load out of the browser's own timing APIs.
 *
 * Nothing here is estimated: each number is an entry the browser recorded -
 * Navigation Timing, Paint Timing, Largest Contentful Paint, Resource Timing,
 * and the two marks `main.ts` sets. A pure function of `Performance`, so it
 * can be tested with a fake one. `lcp` is passed in because LCP entries are
 * only observable, not queryable.
 */
export function readPageLoad(performance: Performance, lcp: number | null): PageLoad {
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
  const stable = performance.getEntriesByName(APP_STABLE_MARK)[0]?.startTime ?? null;
  const bootstrap = performance.getEntriesByName(BOOTSTRAP_START_MARK)[0]?.startTime ?? null;
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

  const htmlBytes = navigation?.transferSize ?? null;
  const resourceBytes = resources.reduce((sum, entry) => sum + entry.transferSize, 0);

  return {
    ttfb: navigation ? navigation.responseStart : null,
    fcp,
    lcp,
    appStable: stable,
    bootstrapToStable: stable !== null && bootstrap !== null ? stable - bootstrap : null,
    htmlBytes,
    totalBytes: htmlBytes === null ? null : htmlBytes + resourceBytes,
  };
}

const METRICS = [
  'ttfb',
  'fcp',
  'lcp',
  'appStable',
  'bootstrapToStable',
  'htmlBytes',
  'totalBytes',
] as const;

/**
 * Shows the numbers for the load that produced the page you are looking at.
 *
 * Browser only by nature: the server renders the labels with no values, and
 * the browser fills them in once the application has settled. A reload is a
 * new measurement - which is the point of putting it on the page, next to a
 * button that does exactly that.
 */
@Component({
  selector: 'app-page-load-metrics',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl
      class="metrics"
      data-testid="page-load-metrics"
      *transloco="let t; prefix: 'pages.labs.rendering.metrics'"
    >
      @for (metric of metrics; track metric) {
        <div class="metrics__item">
          <dt>{{ t(metric) }}</dt>
          <dd [attr.data-testid]="'metric-' + metric">
            @if (load()?.[metric] ?? null; as value) {
              {{
                metric.endsWith('Bytes')
                  ? t('bytes', { value: rounded(value) })
                  : t('milliseconds', { value: rounded(value) })
              }}
            } @else {
              {{ t('pending') }}
            }
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
      gap: var(--space-2);
      margin: 0;
    }

    .metrics__item {
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-md);
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
      font-weight: var(--weight-semibold);
    }
  `,
})
export class PageLoadMetrics {
  protected readonly metrics = METRICS;
  protected readonly load = signal<PageLoad | null>(null);

  protected rounded(value: number): number {
    return Math.round(value);
  }

  constructor() {
    const win = inject(WINDOW);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const performance = win?.performance;
      const Observer = (
        win as (Window & { PerformanceObserver?: typeof PerformanceObserver }) | null
      )?.PerformanceObserver;
      if (!performance || !Observer) {
        return;
      }

      let lcp: number | null = null;
      const update = (): void => this.load.set(readPageLoad(performance, lcp));

      // `buffered: true` delivers what happened before this component existed:
      // by the time the application has rendered, the paint is long over.
      const lcpObserver = new Observer((list) => {
        lcp = list.getEntries().at(-1)?.startTime ?? lcp;
        update();
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      // The stable mark is set after bootstrap resolves, which can be after
      // this first render; observing marks catches it whenever it lands.
      const markObserver = new Observer(update);
      markObserver.observe({ type: 'mark', buffered: true });

      update();
      destroyRef.onDestroy(() => {
        lcpObserver.disconnect();
        markObserver.disconnect();
      });
    });
  }
}
