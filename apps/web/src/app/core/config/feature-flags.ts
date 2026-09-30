import { inject, Injectable } from '@angular/core';
import { AppConfigStore } from './app-config';
import type { FeatureFlag } from './app-config';

/**
 * Runtime feature flags (docs/feature-flags.md).
 *
 * Read from `config.json`, so they differ per deployment of the same bundle.
 * Reactive: a `computed()` or template that calls `isEnabled` re-evaluates
 * when the configuration arrives.
 *
 * Build-time flags are deliberately **not** readable here. They live in
 * `environments/` and must be read as constants
 * (`if (environment.buildFlags.enableDevTools)`) at the place that decides
 * whether code ships - read through a method, the bundler can no longer see
 * that the branch is dead, and the code the flag was meant to remove stays in
 * the bundle. That is the one property a build-time flag exists for.
 *
 * Deliberately not a feature-flag platform: no targeting, no percentages, no
 * remote evaluation. When a flag needs one of those, it needs a service
 * (LaunchDarkly, Unleash, a backend endpoint), and this class becomes its
 * adapter.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  private readonly config = inject(AppConfigStore).config;

  isEnabled(flag: FeatureFlag): boolean {
    return this.config().features[flag];
  }
}
