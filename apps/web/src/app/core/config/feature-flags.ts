import { inject, Injectable } from '@angular/core';
import { AppConfigStore } from './app-config';
import type { FeatureFlag } from './app-config';
import { environment } from '../../../environments/environment';

/**
 * Feature flag seam.
 *
 * Runtime flags come from `config.json` and can differ per environment without
 * a rebuild. Build-time flags live in `BuildEnvironment` and disappear from the
 * bundle when disabled. Phase 7 decides whether anything more is warranted;
 * this is deliberately not a feature-flag platform.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlags {
  private readonly config = inject(AppConfigStore).config;

  /** Reads a runtime flag. Reactive: signal-based callers re-evaluate. */
  isEnabled(flag: FeatureFlag): boolean {
    return this.config().features[flag];
  }

  /** True when this build shipped developer tooling. */
  get devToolsEnabled(): boolean {
    return environment.buildFlags.enableDevTools;
  }
}
