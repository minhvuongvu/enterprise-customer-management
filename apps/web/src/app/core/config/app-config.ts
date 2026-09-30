import { Injectable, signal } from '@angular/core';
import * as z from 'zod';
import { LOG_LEVELS, type LogLevel } from '../logging/log-level';

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

/**
 * Runtime feature flags - switched per deployment in `config.json`, without a
 * rebuild. When to use one rather than a build-time flag is in
 * docs/feature-flags.md; the short version: a runtime flag for a *decision*
 * (is import open in this environment?), a build-time flag for *code that
 * must not ship* (developer tooling).
 *
 * Add a member here, its default below, and a line in docs/feature-flags.md
 * with an owner and a removal condition. A flag nobody plans to remove is
 * configuration, and belongs in `AppConfig` as a named setting.
 */
export const FEATURE_FLAGS = ['technicalLabs', 'routePreloading', 'customerImport'] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

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
    routePreloading: true,
    customerImport: true,
  },
};

/**
 * What `config.json` may contain: any subset, flags included. A deployment
 * that predates a flag omits it, and gets the default.
 *
 * Validated, because the file is edited by hand, per environment, by people
 * who are not reading this code: `"technicalLabs": "false"` is a string, and
 * a string is truthy. Strict, so a misspelt key (`"customerImprot"`) is an
 * error that names itself rather than a flag that silently never turns off.
 */
export const appConfigOverridesSchema = z.strictObject({
  apiBaseUrl: z.string().min(1).optional(),
  defaultLanguage: z.string().min(2).max(10).optional(),
  logLevel: z.enum(LOG_LEVELS as [LogLevel, ...LogLevel[]]).optional(),
  features: z
    .strictObject(
      Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag, z.boolean().optional()])) as Record<
        FeatureFlag,
        z.ZodOptional<z.ZodBoolean>
      >,
    )
    .optional(),
});

export type AppConfigOverrides = Partial<Omit<AppConfig, 'features'>> & {
  readonly features?: Partial<AppConfig['features']>;
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
  apply(overrides: AppConfigOverrides): void {
    this.current.set({
      ...DEFAULT_APP_CONFIG,
      ...overrides,
      features: { ...DEFAULT_APP_CONFIG.features, ...(overrides.features ?? {}) },
    });
  }
}
