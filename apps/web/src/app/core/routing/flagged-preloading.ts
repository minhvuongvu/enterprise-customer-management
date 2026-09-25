import { inject, Injectable } from '@angular/core';
import type { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, type Observable } from 'rxjs';
import { FeatureFlags } from '../config/feature-flags';
import { NAVIGATOR } from '../platform/platform.tokens';

/** `navigator.connection` is not in every browser, nor in the DOM typings. */
interface NetworkInformation {
  readonly saveData?: boolean;
}

/**
 * Preloads the routes that ask for it (`withMetadata({ preload: true })`),
 * and no others (docs/performance.md, "Preloading").
 *
 * The two ready-made strategies are the two ends of the trade-off: `NoPreloading`
 * makes the first visit to every section wait for its code, and
 * `PreloadAllModules` downloads every lazy chunk - the technical labs
 * included - for every user, whether or not they will ever open them. A flag
 * on the route sits between: the shell and the customer list, which almost
 * every session reaches next, are fetched while the user is still typing
 * their password.
 *
 * Nothing is preloaded when the user has asked the browser to save data
 * (`Save-Data`), or when the `routePreloading` runtime flag is off - which is
 * also how perf/measure-preloading.ts measures the difference without a
 * second build.
 *
 * The router calls this after the first navigation, for every route in the
 * configuration, recursing into children as their configuration becomes
 * known.
 */
@Injectable({ providedIn: 'root' })
export class FlaggedPreloading implements PreloadingStrategy {
  private readonly flags = inject(FeatureFlags);
  private readonly navigator = inject(NAVIGATOR) as
    (Navigator & { connection?: NetworkInformation }) | null;

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const wanted = route.data?.['preload'] === true;
    const allowed =
      this.flags.isEnabled('routePreloading') && !this.navigator?.connection?.saveData;
    return wanted && allowed ? load() : EMPTY;
  }
}
