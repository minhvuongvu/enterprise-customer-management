/**
 * Configuration that is fixed when the bundle is built.
 *
 * Contrast with `AppConfigStore`, which is fetched at startup and can differ
 * between deployments of the *same* bundle.
 *
 * Use a build-time flag when the code behind it should not ship at all.
 * Use a runtime flag when the same artifact must behave differently per
 * environment - which is what lets one tested bundle be promoted from staging
 * to production without rebuilding.
 */
export interface BuildEnvironment {
  readonly production: boolean;
  readonly buildFlags: {
    readonly enableDevTools: boolean;
  };
}
