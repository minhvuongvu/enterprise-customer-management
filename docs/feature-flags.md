# Feature flags

A small flag system with two kinds of flag, and a rule for choosing between them.
Deliberately not a flag platform: no targeting, no percentage rollouts, no remote
evaluation. [ADR-0040](decisions/0040-build-time-and-runtime-flags.md).

---

## 1. Which kind to use

| Question                                                       | Build-time                           | Runtime                                  |
| -------------------------------------------------------------- | ------------------------------------ | ---------------------------------------- |
| Must the code be **absent** from some builds?                  | **yes** - that is its only job       | no - the code always ships               |
| Must the **same artifact** behave differently per environment? | no - needs a rebuild                 | **yes** - `config.json` per deploy       |
| Can it change **without a release**?                           | no                                   | yes (redeploy `config.json`)             |
| Examples                                                       | developer tooling                    | a kill switch, a feature per environment |
| Where                                                          | `environments/` + `fileReplacements` | `config.json` → `AppConfig.features`     |

The rule: **a runtime flag for a decision, a build-time flag for code that must not
ship.** Promoting one tested bundle from staging to production is the reason runtime
flags are the default - a build-time flag means staging tested a different bundle.

Neither is security. A flag hides UI and routes (rule 10); if a switched-off feature must
really be unavailable, the server refuses it too.

## 2. Runtime flags

```jsonc
// apps/web/public/config.json - replaced per deployment, never rebuilt
{ "features": { "technicalLabs": true, "routePreloading": true, "customerImport": true } }
```

| Flag              | Default | What it does when off                                                  | Owner / removal                                                    |
| ----------------- | ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `technicalLabs`   | on      | `/technical-labs` does not match; nav item hidden; chunk not loaded    | Permanent: a deployment setting                                    |
| `routePreloading` | on      | No background fetching of flagged routes (ADR-0031)                    | Permanent: a performance setting                                   |
| `customerImport`  | on      | Import button and menu item hidden; `/customers/import` does not match | Kill switch: remove once import has run a quarter without incident |

Reading one:

```ts
// in a component or computed: reactive, re-evaluates when config.json arrives
protected readonly importEnabled = computed(() => this.features.isEnabled('customerImport'));

// on a route: the route does not exist while the flag is off (CanMatch)
{ path: 'import', canMatch: [featureEnabled('customerImport')], loadComponent: … }
```

`CanMatch`, not `CanActivate`: a switched-off route is not refused (which would hint at a
hidden feature), it is absent - the URL falls through to the next route that matches,
and the lazy chunk is never downloaded.

**Validation.** `config.json` is edited by hand, per environment. It is parsed with a
strict Zod schema (`appConfigOverridesSchema`): `"technicalLabs": "false"` (a string, and
truthy) or a misspelt key is rejected, the **whole file** is ignored for the defaults, and
the reason is logged at `error`. Half a configuration is a state nobody tested; the
defaults are one.

**Adding one**: a member of `FEATURE_FLAGS`, its default in `DEFAULT_APP_CONFIG`, a key in
`public/config.json`, and a row above with its owner and removal condition. A flag nobody
intends to remove is configuration - give it a named setting in `AppConfig` instead.

## 3. Build-time flags

```ts
// environments/environment.ts             buildFlags: { enableDevTools: true }
// environments/environment.production.ts  buildFlags: { enableDevTools: false }
// angular.json → production → fileReplacements:
//   core/observability/dev-tools.providers.ts → dev-tools.providers.production.ts
```

| Flag             | Development, test | Production | What it includes                                     |
| ---------------- | ----------------- | ---------- | ---------------------------------------------------- |
| `enableDevTools` | on                | off        | `MemoryLogSink` and the observability lab's live log |

**How code is removed**: by replacing the file that imports it, not by `if (flag)`.
Phase 7 learned this the hard way: the first version read
`environment.buildFlags.enableDevTools` in an `if`, and `perf/check-budgets.ts` found
`memory-log-sink.ts` in the production `main` bundle anyway - a compiled Angular class
carries static initialisers, and a bundler keeps a class with those even behind a dead
branch. A replaced file removes the import itself. `perf/check-budgets.ts` keeps
checking (`neverInProduction`), so a build-time flag that silently stops working fails
CI. `e2e-production/performance-budgets.spec.ts` checks the other side: the lab says the
log is not in this build.

`environment.buildFlags` records what a build contains; `fileReplacements` does the
removal. Change both together.

## 4. What this is not

- **No per-user flags.** Every user of a deployment sees the same flags. Targeting needs
  a server that knows the user - LaunchDarkly, Unleash, or an endpoint - and
  `FeatureFlags` would become its adapter; no call site changes.
- **No live updates.** `config.json` is read at start-up; a change applies on the next
  load. Enough for a kill switch measured in minutes, not seconds.
- **No flag for work in progress.** Unfinished work lives on a branch here, not behind a
  flag in `main` - there is no trunk-based workflow that would need one.
