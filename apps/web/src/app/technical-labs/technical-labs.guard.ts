import { inject } from '@angular/core';
import type { CanMatchFn } from '@angular/router';
import { FeatureFlags } from '../core/config/feature-flags';

/**
 * Hides the whole lab area behind the `technicalLabs` runtime flag.
 *
 * `CanMatch` rather than `CanActivate`, and the difference matters twice:
 *
 *  - a route that does not *match* is not merely refused, it does not exist -
 *    so the request falls through to the wildcard and the user gets the
 *    ordinary not-found page instead of a redirect that hints at a hidden
 *    feature;
 *  - Angular never loads the lazy chunk, so a disabled feature costs nothing
 *    to ship.
 *
 * It is also the proof that Phase 3 can add `authGuard` and a permission guard
 * to this tree without restructuring it: guards were already part of the shape.
 */
export const technicalLabsEnabled: CanMatchFn = () =>
  inject(FeatureFlags).isEnabled('technicalLabs');
