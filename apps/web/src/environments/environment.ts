import type { BuildEnvironment } from './build-environment';

/**
 * Build-time configuration for development builds.
 *
 * Swapped for `environment.production.ts` by the `fileReplacements` entry in
 * angular.json. See docs/architecture.md for when to use this instead of the
 * runtime configuration.
 */
export const environment: BuildEnvironment = {
  production: false,
  buildFlags: {
    // Build-time flags are constants, so a disabled one lets the bundler drop
    // the code behind it entirely. That is the whole reason to use one.
    enableDevTools: true,
  },
};
