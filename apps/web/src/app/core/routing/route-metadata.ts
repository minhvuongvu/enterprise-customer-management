import type { ActivatedRouteSnapshot, Data } from '@angular/router';

/**
 * Typed route metadata.
 *
 * Angular types `Route.data` as `{ [key: string]: any }`, which means a typo in
 * a route definition is silent and a consumer reading it is guessing. These two
 * functions put a type on both ends: routes are authored through
 * `withMetadata()`, and anything reading route data goes through
 * `routeMetadata()`.
 *
 * Everything here is a *translation key*, never a label. A route file that
 * contains English is a hardcoded string that survived review because it did
 * not look like one.
 */
export interface RouteMetadata {
  /**
   * Translation key for this route's breadcrumb.
   *
   * A route without one contributes no crumb - which is how a path-less
   * layout route, or `/customers/:id`'s empty child, stays out of the trail.
   */
  readonly breadcrumb?: string;
}

/**
 * Attaches metadata to a route.
 *
 * Returns `Data` rather than `RouteMetadata` so the result drops straight into
 * a `Route.data` field while the argument is still checked.
 */
export function withMetadata(metadata: RouteMetadata): Data {
  return { ...metadata };
}

/**
 * Reads metadata back off an activated route.
 *
 * Deliberately `routeConfig.data` and not `snapshot.data`. Angular merges a
 * parent's data into a child whose path is empty, so a breadcrumb declared on
 * `/customers` would reappear on its own index child and the trail would read
 * "Customers > Customers". Reading the route's own configuration asks the
 * question that was actually meant: what did *this* route declare?
 */
export function routeMetadata(snapshot: ActivatedRouteSnapshot): RouteMetadata {
  const breadcrumb = snapshot.routeConfig?.data?.['breadcrumb'];
  return typeof breadcrumb === 'string' ? { breadcrumb } : {};
}
