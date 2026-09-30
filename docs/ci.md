# Continuous integration

`.github/workflows/ci.yml` - every push to any branch, every pull request, and on demand.
[ADR-0042](decisions/0042-ci-pipeline.md).

---

## 1. The pipeline

```text
install ─▶ quality ──┬─▶ unit (+coverage) ──┬─▶ e2e shard 1/2 ─┬─▶ cross-browser (Firefox, WebKit)
          format     │                      ├─▶ e2e shard 2/2 ─┘
          lint       │                      ├─▶ accessibility (axe + keyboard)
          arch       │                      └─▶ visual regression
          secrets    └─▶ build ──┬─ bundle budgets ─────────────▶ e2e-production (+ performance budgets)
          typecheck             └─ bundle report (optional)
```

| Job               | Runs                                                                             | Fails on                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`         | `format:check`, `lint`, `typecheck`                                              | any formatting drift; any eslint error; a style-rule violation; **an import cycle or a forbidden import** (`lint/architecture.ts`); **a secret** (`lint/secrets.ts`); a type error under `strict` + `strictTemplates`         |
| `unit`            | `test:coverage` - the lint tools' own tests, web, mock API, contracts            | a failing test; **coverage below the thresholds** (angular.json, `vitest.config.ts`)                                                                                                                                          |
| `build`           | `build`, `perf:budgets`, bundle report                                           | a build error; **the initial bundle past 540 kB** (angular.json); **a budget in `perf/budgets.json`** - initial JS, largest lazy chunk, total JS, and anything in `neverInProduction` (build-time-flagged code, test helpers) |
| `e2e` (×2 shards) | the functional E2E suite, Chromium                                               | a failing journey                                                                                                                                                                                                             |
| `accessibility`   | `e2e/accessibility.spec.ts` + `e2e/keyboard.spec.ts`                             | **a critical or serious axe violation** on any route in either theme; a keyboard journey that breaks                                                                                                                          |
| `e2e-production`  | the production build: service worker, preloading, hydration, **runtime budgets** | a failing test; **initial load, route navigation, API latency or a long task over budget**                                                                                                                                    |
| `visual`          | `playwright.visual.config.ts` - 14 screenshots                                   | a pixel difference above 0.2 % of a screenshot                                                                                                                                                                                |
| `cross-browser`   | smoke, auth, CRUD, cross-tab, labs - in Firefox and WebKit                       | a failing journey in either engine                                                                                                                                                                                            |

**Nothing is `continue-on-error`** except the bundle report, which only describes. A
retry (two, on CI) exists for the E2E suites because they drive a real browser against a
real server; a test that needs its retry is reported as _flaky_ in the run summary, and a
flaky test is a bug to fix, not a pass.

## 2. Where it runs

- **Node jobs** (`quality`, `unit`, `build`) on `ubuntu-latest` with the Node version in
  `.nvmrc` and npm's cache.
- **Browser jobs** inside `mcr.microsoft.com/playwright:v1.63.0-noble` - the browsers
  Playwright 1.63 expects, preinstalled, and **the same fonts and rendering the visual
  baselines were made with**. The image tag must move with `@playwright/test`.
- `HOME=/root` in the container: Firefox refuses a home directory owned by another user,
  which is what the runner mounts.
- **No secrets.** `permissions: contents: read`; the pipeline needs nothing else.
- `concurrency` cancels a run superseded by a newer push to the same branch.

## 3. The same checks locally

| CI job                                  | Locally                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------- |
| quality                                 | `npm run format:check && npm run lint && npm run typecheck`                 |
| unit                                    | `npm run test:coverage` (or `npm test`, without coverage)                   |
| build                                   | `npm run build && npm run perf:budgets`                                     |
| e2e + a11y                              | `npm run e2e` (both); `E2E_SUITE=accessibility npm run e2e`                 |
| e2e-production                          | `npm run build && npm run e2e:production`                                   |
| visual                                  | `npm run e2e:visual` (Docker; see testing-strategy.md)                      |
| cross-browser                           | `E2E_BROWSERS=all npx playwright test --project=firefox --project=webkit …` |
| everything but visual and cross-browser | `npm run verify`                                                            |

## 4. Proving the gates bite

A gate that never fails is decoration. Each was shown failing on a real violation before
it was trusted:

| Gate                     | Shown failing on                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture check       | `app.routes.ts` importing `technical-labs.guard.ts` - a real violation on its first run, fixed by `featureEnabled()`                                                             |
| bundle budgets           | `memory-log-sink.ts` in the production `main` bundle - a real leak on its first run, fixed with `fileReplacements`                                                               |
| visual regression        | the dropdown's check mark rendering as "¹3" - a real Phase 6 bug on its first run                                                                                                |
| secret scan              | its own test file's connection-string example - on its first run                                                                                                                 |
| the pipeline, end to end | run #3: a lab importing the customer store, pushed deliberately - `quality` failed on `features-are-isolated`, nothing downstream ran; reverted (PROGRESS.md, Phase 7 "CI runs") |
| coverage gate            | run #1, not deliberately: contracts branch coverage 94.73 % against 95 %                                                                                                         |
| unit tests of the tools  | `lint/*.test.ts`: every architecture rule and every secret pattern shown a violation it must report                                                                              |

## 5. Required checks (repository settings)

The workflow makes a failure visible; only branch protection makes it blocking. For the
default branch, a repository owner should require: `quality`, `unit`, `build`, both `e2e`
shards, `accessibility`, `e2e-production`, `visual` and `cross-browser`; and enable secret
scanning with push protection. Those are settings, not files - they cannot be committed,
which is why they are written down here.

## 6. Timing and cost

The first green run took **7 minutes** end to end: quality 1 min; unit and build ~40 s
each, in parallel; the E2E shards ~2 min, accessibility 3 min, visual 1.5 min and the
production suite 1 min, in parallel; Firefox + WebKit 3 min after the E2E jobs. The E2E
suite is the long pole:
215 tests in a real browser against a dev server. It is sharded in two rather than
trimmed - the axe audit alone is 64 states, and each is a regression a user would meet.
