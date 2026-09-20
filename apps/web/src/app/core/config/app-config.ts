import { Injectable, signal } from '@angular/core';
import type { LogLevel } from '../logging/logger';

/**
 * Runtime configuration: read at startup, not baked into the bundle.
 *
 * One built artifact is promoted from staging to production unchanged; what
 * differs between them is fetched from `/config.json` at boot. Anything that
 * must be decided before the bundle exists belongs in `BuildEnvironment`
 * instead.
 *
 * Nothing secret goes here. This file is served to every browser.
 */

/** Runtime feature flags. Add a member, then a key in `config.json`. */
export type FeatureFlag = 'technicalLabs';

export interface AppConfig {
  /** Base URL of the API. The mock API arrives in Phase 0.5. */
  readonly apiBaseUrl: string;
  /** Language used before the user has chosen one. */
  readonly defaultLanguage: string;
  /** Lowest level that reaches the log sink. */
  readonly logLevel: LogLevel;
  readonly features: Readonly<Record<FeatureFlag, boolean>>;
}

/**
 * Values used when `/config.json` is missing or unreadable, and on the server.
 *
 * Deliberately a complete, working configuration: a deployment that forgets the
 * file should start in a safe state rather than fail to boot.
 */
export const DEFAULT_APP_CONFIG: AppConfig = {
  apiBaseUrl: '/api',
  defaultLanguage: 'en',
  logLevel: 'info',
  features: {
    technicalLabs: true,
  },
};

@Injectable({ providedIn: 'root' })
export class AppConfigStore {
  private readonly current = signal<AppConfig>(DEFAULT_APP_CONFIG);

  /** The active configuration. A signal, so a change re-renders what reads it. */
  readonly config = this.current.asReadonly();

  /**
   * Merges fetched values over the defaults.
   *
   * Shallow by design except for `features`: a partial `config.json` should add
   * to the defaults rather than silently blanking every flag it omits.
   */
  apply(overrides: Partial<AppConfig>): void {
    this.current.set({
      ...DEFAULT_APP_CONFIG,
      ...overrides,
      features: { ...DEFAULT_APP_CONFIG.features, ...(overrides.features ?? {}) },
    });
  }
}
