import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { endpointTemplate } from '@ecm/contracts';
import {
  NavigationEnd,
  NavigationStart,
  Router,
  type ActivatedRouteSnapshot,
} from '@angular/router';
import { filter } from 'rxjs';
import { Logger } from '../logging/logger';
import { IS_BROWSER, WINDOW } from '../platform/platform.tokens';
import { ErrorTracker } from './error-tracker';
import { PERFORMANCE_BUDGETS, type PerformanceBudget } from './performance-budgets';

/**
 * Measures the running application: initial load, route navigation, API
 * latency and long main-thread tasks (docs/observability.md).
 *
 * Every measurement is logged - `debug` inside its budget, `warn` over it,
 * with the budget alongside - and kept in signals the observability lab
 * renders. Browser only: on the server there is nothing to measure, and
 * `start()` returns at once.
 *
 * What it does not do is sample, aggregate across users, or send anything
 * anywhere. Those are a collector's job; a `LogSink` that ships entries is
 * where one would plug in.
 */

export interface InitialLoadMetrics {
  readonly timeToFirstByteMs: number | null;
  readonly firstContentfulPaintMs: number | null;
  readonly largestContentfulPaintMs: number | null;
  readonly domContentLoadedMs: number | null;
  readonly loadEventMs: number | null;
}

export interface NavigationTiming {
  /** The route template (`customers/:id/edit`), never the URL with its ids. */
  readonly route: string;
  readonly durationMs: number;
}

export interface LatencySummary {
  readonly endpoint: string;
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface LongTaskSummary {
  readonly count: number;
  readonly totalMs: number;
  readonly longestMs: number;
}

/** Recent samples per endpoint: enough for a percentile, bounded in memory. */
const SAMPLES_PER_ENDPOINT = 50;
const NAVIGATIONS_KEPT = 20;

@Injectable({ providedIn: 'root' })
export class PerformanceMonitor {
  private readonly logger = inject(Logger);
  private readonly errors = inject(ErrorTracker);
  private readonly router = inject(Router);
  private readonly window = inject(WINDOW);
  private readonly isBrowser = inject(IS_BROWSER);
  private readonly destroyRef = inject(DestroyRef);

  private readonly initialLoadState = signal<InitialLoadMetrics | null>(null);
  private readonly navigationState = signal<readonly NavigationTiming[]>([]);
  private readonly apiSamples = signal<ReadonlyMap<string, readonly number[]>>(new Map());
  private readonly longTaskState = signal<LongTaskSummary>({ count: 0, totalMs: 0, longestMs: 0 });

  readonly initialLoad = this.initialLoadState.asReadonly();
  readonly navigations = this.navigationState.asReadonly();
  readonly longTasks = this.longTaskState.asReadonly();

  private started = false;
  private largestContentfulPaint: number | null = null;

  /** Starts observing. Idempotent; a no-op on the server. */
  start(): void {
    if (this.started || !this.isBrowser || !this.window) {
      return;
    }
    this.started = true;

    this.observe('largest-contentful-paint', (entry) => {
      this.largestContentfulPaint = entry.startTime;
    });
    this.observe('longtask', (entry) => this.recordLongTask(entry.duration));
    this.watchNavigations();
    this.reportInitialLoadWhenLoaded(this.window);
  }

  /** Called by the request-logging interceptor for every finished request. */
  recordApiCall(method: string, url: string, durationMs: number, status: number): void {
    const endpoint = `${method} ${endpointTemplate(url)}`;
    this.apiSamples.update((current) => {
      const next = new Map(current);
      next.set(
        endpoint,
        [...(current.get(endpoint) ?? []), durationMs].slice(-SAMPLES_PER_ENDPOINT),
      );
      return next;
    });
    this.report('apiCallMs', 'API call', durationMs, { endpoint, status });
  }

  /** p50 / p95 / max per endpoint, slowest p95 first. */
  apiLatency(): readonly LatencySummary[] {
    return [...this.apiSamples().entries()]
      .map(([endpoint, samples]) => summarise(endpoint, samples))
      .sort((a, b) => b.p95Ms - a.p95Ms);
  }

  private watchNavigations(): void {
    let startedAt: number | null = null;
    const subscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationStart || event instanceof NavigationEnd))
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          startedAt = performance.now();
          return;
        }
        // The first navigation is part of the initial load, measured there.
        if (startedAt === null || event.id === 1) {
          startedAt = null;
          return;
        }
        const route = routeTemplateOf(this.router.routerState.snapshot.root);
        const durationMs = Math.round(performance.now() - startedAt);
        startedAt = null;
        this.navigationState.update((list) =>
          [...list, { route, durationMs }].slice(-NAVIGATIONS_KEPT),
        );
        this.errors.addBreadcrumb({ category: 'navigation', message: route });
        this.report('routeNavigationMs', 'Route navigation', durationMs, { route });
      });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /**
   * Reports once the page has loaded **and painted**. A fast page fires `load`
   * before its first paint - the first version reported then, and a
   * production build logged FCP and LCP as "not measured" (found by the
   * budget test, which now requires both). A page that never paints is
   * reported after 5 s with what is known.
   */
  private reportInitialLoadWhenLoaded(window: Window): void {
    let reported = false;
    const report = () => {
      if (!reported) {
        reported = true;
        // A frame and a task later: the paint's LCP candidate is recorded,
        // and the load event's own handlers are inside loadEventEnd.
        window.requestAnimationFrame(() => window.setTimeout(() => this.reportInitialLoad(), 0));
      }
    };
    const afterPaint = () => {
      if (
        performance.getEntriesByName('first-contentful-paint').length > 0 ||
        !this.supports('paint')
      ) {
        report();
        return;
      }
      this.observe('paint', (entry) => {
        if (entry.name === 'first-contentful-paint') {
          report();
        }
      });
      window.setTimeout(report, 5_000);
    };
    if (window.document.readyState === 'complete') {
      afterPaint();
    } else {
      window.addEventListener('load', afterPaint, { once: true });
    }
  }

  private reportInitialLoad(): void {
    const [navigation] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    const paint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-contentful-paint');

    const metrics: InitialLoadMetrics = {
      timeToFirstByteMs: rounded(navigation?.responseStart),
      firstContentfulPaintMs: rounded(paint?.startTime),
      // Provisional: LCP can still grow until the first input. What is known
      // at load is what a user waited for before the page looked complete.
      largestContentfulPaintMs: rounded(this.largestContentfulPaint ?? undefined),
      domContentLoadedMs: rounded(navigation?.domContentLoadedEventEnd),
      loadEventMs: rounded(navigation?.loadEventEnd),
    };
    this.initialLoadState.set(metrics);

    const overBudget =
      exceeds(metrics.largestContentfulPaintMs, 'largestContentfulPaintMs') ||
      exceeds(metrics.firstContentfulPaintMs, 'firstContentfulPaintMs') ||
      exceeds(metrics.timeToFirstByteMs, 'timeToFirstByteMs');
    const fields = {
      ...metrics,
      budgets: {
        largestContentfulPaintMs: PERFORMANCE_BUDGETS.largestContentfulPaintMs,
        firstContentfulPaintMs: PERFORMANCE_BUDGETS.firstContentfulPaintMs,
        timeToFirstByteMs: PERFORMANCE_BUDGETS.timeToFirstByteMs,
      },
    };
    if (overBudget) {
      this.logger.warn('Initial load over budget', fields);
    } else {
      this.logger.info('Initial load', fields);
    }
  }

  private recordLongTask(durationMs: number): void {
    this.longTaskState.update((current) => ({
      count: current.count + 1,
      totalMs: Math.round(current.totalMs + durationMs),
      longestMs: Math.max(current.longestMs, Math.round(durationMs)),
    }));
    // Every long task is over 50 ms by definition; only the ones a user
    // would feel are worth a line in the log.
    if (durationMs > PERFORMANCE_BUDGETS.longTaskMs) {
      this.logger.warn('Long task', {
        durationMs: Math.round(durationMs),
        budgetMs: PERFORMANCE_BUDGETS.longTaskMs,
      });
    }
  }

  private report(
    budget: PerformanceBudget,
    message: string,
    durationMs: number,
    fields: Readonly<Record<string, unknown>>,
  ): void {
    const limit = PERFORMANCE_BUDGETS[budget];
    if (durationMs > limit) {
      this.logger.warn(`${message} over budget`, { ...fields, durationMs, budgetMs: limit });
    } else {
      this.logger.debug(message, { ...fields, durationMs });
    }
  }

  /**
   * `PerformanceObserver` for one entry type, if this browser supports it.
   * Long tasks and LCP are Chromium-only today; elsewhere they are simply not
   * measured, and the lab says "not supported" rather than showing zero.
   */
  private observe(type: string, onEntry: (entry: PerformanceEntry) => void): void {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes?.includes(type)
    ) {
      return;
    }
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
    observer.observe({ type, buffered: true });
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** True when this browser reports the entry type - for the lab's labels. */
  supports(type: 'longtask' | 'largest-contentful-paint' | 'paint'): boolean {
    return (
      typeof PerformanceObserver !== 'undefined' &&
      (PerformanceObserver.supportedEntryTypes?.includes(type) ?? false)
    );
  }
}

/** `customers/:id/edit` - the configured path, from the root to the leaf. */
export function routeTemplateOf(root: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  let current: ActivatedRouteSnapshot | null = root;
  while (current) {
    const path = current.routeConfig?.path;
    if (path) {
      parts.push(path);
    }
    current = current.firstChild;
  }
  return `/${parts.join('/')}`;
}

export function summarise(endpoint: string, samples: readonly number[]): LatencySummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (quantile: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1)] ?? 0;
  return {
    endpoint,
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function rounded(value: number | undefined): number | null {
  return value === undefined || value <= 0 ? null : Math.round(value);
}

function exceeds(value: number | null, budget: PerformanceBudget): boolean {
  return value !== null && value > PERFORMANCE_BUDGETS[budget];
}
