/**
 * Performance budgets measured in the running application.
 *
 * Each is a *field* threshold: a measurement over it is logged as a `warn`
 * with the budget beside it, so a slow page shows up in the log with the
 * number that makes it slow. The numbers are the "good" limits Google's Core
 * Web Vitals and RAIL use, where one exists, and a documented guess where one
 * does not (docs/performance.md, "Budgets").
 *
 * These are not the CI budgets. CI enforces the bundle (angular.json and
 * `perf/budgets.json`) and a lab measurement of the production build
 * (`e2e-production/performance-budgets.spec.ts`); those fail the build. A
 * user's slow laptop cannot fail a build, so these only report.
 */
export const PERFORMANCE_BUDGETS = {
  /** Largest Contentful Paint - Core Web Vitals "good". */
  largestContentfulPaintMs: 2_500,
  /** First Contentful Paint - Lighthouse "good" on desktop. */
  firstContentfulPaintMs: 1_800,
  /** Time to First Byte - Core Web Vitals "good". */
  timeToFirstByteMs: 800,
  /**
   * A route change, from the router starting to the new page rendered - lazy
   * chunk and guards included, data not. RAIL's "response" band is 100 ms for
   * feedback and 1 s for a task; a navigation is a task.
   */
  routeNavigationMs: 1_000,
  /** One API call, from request to response as the application saw it. */
  apiCallMs: 1_000,
  /** A main-thread task longer than this blocks input noticeably (RAIL). */
  longTaskMs: 200,
} as const;

export type PerformanceBudget = keyof typeof PERFORMANCE_BUDGETS;
