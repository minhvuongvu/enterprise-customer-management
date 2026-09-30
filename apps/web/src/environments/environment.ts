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
    // Development and test builds include developer tooling. A disabled
    // build-time flag removes its code from the bundle - the one reason to
    // use one instead of a runtime flag (docs/feature-flags.md).
    enableDevTools: true,
  },
};
