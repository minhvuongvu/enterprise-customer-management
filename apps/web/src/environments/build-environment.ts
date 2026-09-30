/**
 * Configuration that is fixed when the bundle is built.
 *
 * Contrast with `AppConfigStore`, which is fetched from `config.json` at
 * startup and can differ between deployments of the *same* bundle
 * (docs/configuration.md).
 *
 * Use a build-time flag when the code behind it must not ship at all. Use a
 * runtime flag when the same artifact must behave differently per
 * environment - which is what lets one tested bundle be promoted from staging
 * to production without rebuilding (docs/feature-flags.md).
 *
 * Never a secret: every value here is compiled into JavaScript that every
 * browser downloads.
 */
export interface BuildEnvironment {
  readonly production: boolean;
  readonly buildFlags: {
    /**
     * Developer tooling: the in-memory log sink behind the observability
     * lab's live log (ADR-0040). A record of what this build contains -
     * the *removal* is done by `fileReplacements` in angular.json
     * (`dev-tools.providers.ts`), because a bundler cannot delete a compiled
     * Angular class from behind an `if`. Change both together.
     */
    readonly enableDevTools: boolean;
  };
}
