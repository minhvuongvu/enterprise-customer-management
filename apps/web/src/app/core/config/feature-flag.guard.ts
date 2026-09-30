import { inject } from '@angular/core';
import type { CanMatchFn } from '@angular/router';
import type { FeatureFlag } from './app-config';
import { FeatureFlags } from './feature-flags';

/**
 * A route that exists only while a runtime flag is on (docs/feature-flags.md).
 *
 * `CanMatch` rather than `CanActivate`, and the difference matters twice:
 *
 *  - a route that does not *match* is not refused, it does not exist - the
 *    URL falls through to the next route that matches (the wildcard's
 *    not-found page, or `/customers/:id`'s "no such customer"), never a
 *    redirect that hints at a hidden feature;
 *  - Angular never loads the lazy chunk, so a switched-off feature costs
 *    nothing to download.
 *
 * Like every frontend check, this is UX, not security (rule 10): a flag that
 * hides import must be matched by the server refusing import, if it matters.
 */
export function featureEnabled(flag: FeatureFlag): CanMatchFn {
  return () => inject(FeatureFlags).isEnabled(flag);
}
