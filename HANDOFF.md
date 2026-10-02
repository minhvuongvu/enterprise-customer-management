# Handoff

Orientation for a session picking this repository up cold — in particular a cloud
session that has the git history but none of the conversation that produced it.

**This file is orientation, not authority.** When it disagrees with
`ANGULAR_PROJECT_CONTEXT.md`, that file wins. When it disagrees with
`docs/PROGRESS.md` about what is done, PROGRESS wins — it is updated as part of every
phase's Definition of Done, and this file is updated only at a handoff.

Last updated at **`phase-8-complete`**.

---

## 1. What this is for

An **enterprise-oriented Angular learning repository**: a deliberately small Customer
Management domain with a deliberately deep technical architecture. It is judged on
whether the architecture is understandable, realistic, maintainable and educational —
not only on whether the application works.

Two consequences that shape every decision, and that are easy to get wrong if you
treat this as an ordinary product repository:

- **Explicit beats clever.** A slightly more verbose implementation that makes an
  architectural concept visible is the correct trade-off. The code is read more often
  than it is run.
- **Honesty is a deliverable.** A failing check is reported as failing. A gap is
  written into the technical-debt register rather than smoothed over. A frontend
  control is never described as a security boundary.

It is built **phase by phase** from the prompts in `prompts/`. `CLAUDE.md` holds the
operating rules — read it first, in full. The per-phase workflow and the Definition of
Done there are not advisory.

---

## 2. Decisions that are settled

### Locked by the context document

`ANGULAR_PROJECT_CONTEXT.md` §5 is **LOCKED**. An implementation phase may not change
it; only a new ADR that explicitly supersedes `0001-locked-technical-stack.md` may.
The parts that come up most often:

| Concern       | Locked decision                                                         |
| ------------- | ----------------------------------------------------------------------- |
| Framework     | Angular 22, standalone + signals, zoneless, SSR-scaffolded              |
| TypeScript    | 6.0.x, `strict` + `strictTemplates`. **TypeScript 7 is not compatible** |
| Unit tests    | Vitest via `@angular/build:unit-test`. **Vitest 5 is not compatible**   |
| UI primitives | Hand-written on Angular CDK. **No Material, no PrimeNG**                |
| i18n          | Transloco — runtime language switching is a requirement                 |
| Contracts     | Zod, one schema shared by the app and the mock API                      |
| Mock backend  | A real Express process. **Never an interceptor or in-app stub**         |
| Monorepo      | npm workspaces. **No Nx**                                               |
| Server state  | No store library; per-feature signal store + explicit cache             |

### Decided by ADR

`docs/decisions/` — read the ones that touch what you are about to change.

| ADR  | Decision                                                                              |
| ---- | ------------------------------------------------------------------------------------- |
| 0001 | the locked stack, with the versions actually resolved at install                      |
| 0002 | workspace layout, zoneless, `ngc` for typechecking                                    |
| 0003 | prerender the public surface; client-render the application                           |
| 0004 | translations as lazy chunks, not HTTP                                                 |
| 0005 | runtime configuration is a browser concern                                            |
| 0006 | SSE rather than WebSocket                                                             |
| 0007 | mock backend: in-memory, no build step, deterministic faults                          |
| 0008 | contracts is compiled; the apps run from source                                       |
| 0009 | route titles are translation keys, resolved by a `TitleStrategy`                      |
| 0010 | two token layers; the theme is one attribute on `<html>`                              |
| 0011 | three layouts; CSS for presentation, TypeScript only for drawer behaviour             |
| 0012 | what Phase 2 borrowed from Phase 3, and what it deliberately did not                  |
| 0013 | one feature store, explicit cache, cancellation by switching                          |
| 0014 | the contract type **is** the domain type; no mapping layer                            |
| 0015 | a losing write reloads and resubmits only this user's fields                          |
| 0016 | tokens are `HttpOnly` cookies; the app never holds one (supersedes 0012)              |
| 0017 | reactive refresh, single flight, one retry; one job per interceptor                   |
| 0018 | route, UI and action authorization by permission - none of it security                |
| 0019 | one file policy for both sides; a byte check only the server makes                    |
| 0020 | realtime client: own reconnect, de-duplication, news never overwrites                 |
| 0021 | uploads with progress on XHR, everything else on fetch                                |
| 0022 | notifications are justified global state; one confirmation service                    |
| 0023 | the one optimistic operation: status change, with rollback                            |
| 0024 | CSV import as preview + commit, nothing held on the server                            |
| 0025 | measure the bundle by package; zod namespace import; budget as a ratchet              |
| 0026 | rendering modes measured on public, data-free specimen routes                         |
| 0027 | tabs: one versioned BroadcastChannel, Web Lock refresh, storage event                 |
| 0028 | the service worker caches the app shell, never API data                               |
| 0029 | offline = one read-only, user-scoped snapshot + connectivity UI                       |
| 0030 | the leader-election lab uses a lease on purpose                                       |
| 0031 | preload only the routes flagged `preload: true`                                       |
| 0032 | locale formatting through `Intl`, keyed to the active language                        |
| 0033 | plurals as CLDR-category keys, chosen by `Intl.PluralRules`; no ICU                   |
| 0034 | adaptive layouts: swap components in TypeScript, restyle in CSS                       |
| 0035 | validation reasons as codes: `details.fieldIssues`                                    |
| 0036 | style rules checked by `lint/styles.ts`; logical properties for RTL                   |
| 0037 | focus management: navigation, failed saves, re-rendered controls                      |
| 0038 | one log-redaction policy, in the contracts, inside each logger                        |
| 0039 | error-tracking seam; interaction events as a closed union                             |
| 0040 | runtime flags from a validated config.json; build-time flags by file swap             |
| 0041 | a repository architecture check: cycles and forbidden imports                         |
| 0042 | CI on GitHub Actions; browser jobs and visual baselines in Playwright image           |
| 0043 | a write, once started, runs to completion; the caller only decides whether it listens |
| 0044 | the SSR server caches only fingerprinted files; everything else is revalidated        |

### The ten rules

`CLAUDE.md` lists ten non-negotiable rules. Two are enforced by lint and will fail the
build if broken — no hardcoded user-facing strings, no direct browser globals. The
other eight were enforced by review; since Phase 7 `lint/architecture.ts` also enforces
rules 4 and 5 (no cross-feature imports, no dumping grounds) and `lint/secrets.ts` rule 7.
The ones most often broken by accident are:

- no `HttpClient` in components (presentation → feature state → API client → HTTP);
- no abstraction without a **named** second caller;
- no raw backend errors shown to users — everything maps through the error taxonomy;
- all instants are UTC ISO-8601, and `dateOfBirth` is date-only and must never be
  timezone-shifted.

---

## 3. Where things stand

### Phases

| Phase | Name                                     | Status   |
| ----- | ---------------------------------------- | -------- |
| 0     | Foundation & Architecture                | **Done** |
| 0.5   | Mock API & Contracts                     | **Done** |
| 1     | Routing, Layout & Design System          | **Done** |
| 2     | Customer CRUD, Forms & Server State      | **Done** |
| 3     | Authentication, Authorization & Security | **Done** |
| 4     | Enterprise UX, Files, Notifications & RT | **Done** |
| 5     | Performance, Rendering, Offline & APIs   | **Done** |
| 6     | Accessibility, i18n, Design System & UX  | **Done** |
| 7     | Observability, Testing, CI/CD, Hardening | **Done** |
| 8     | Enterprise Codebase Review               | **Done** |

`docs/PROGRESS.md` is the phase-state file: what each phase built, what deviated, the
technical-debt register and the open questions. **Read it before starting anything.**

### Git

History is linear; each phase branch contains everything before it.

```text
phase-8           <- HEAD, everything is here
phase-7  c6de1d9
phase-6  ed0a8ad
phase-5  dbe6bd7
phase-4  6863370
phase-3  80a3703
phase-2  8da182b
phase-1  4d75b6c
phase-0.5 c0791f9
phase-0  6ef58ce
master   ef498df  <- pre-Phase-0. Nothing has been merged into it.
```

Two things a cloud session will trip over:

- **`master` is stale on purpose.** No phase has been merged. History is linear, so
  `master` can be fast-forwarded to `phase-8-complete` - a repository-owner action
  (docs/enterprise-review.md DX-1). Until then, branch new work from `phase-8`.
- **CI runs on every push** (`.github/workflows/ci.yml`); a phase branch shows its checks
  on GitHub. The checks are not yet _required_ (debt 33).
- **Branches are on the remote. The `phase-3-complete` to `phase-8-complete` tags
  may not be**: the cloud session's git proxy refused
  tag pushes (HTTP 403). If `git ls-remote --tags origin` does not list them,
  create them on the phase branches' heads and push from a local machine.

### Verification at `phase-8-complete`

`npm run verify` runs format → lint → typecheck → test:coverage → build → perf:budgets → e2e →
e2e:production. The authoritative numbers are in the Phase 8 entry of
`docs/PROGRESS.md` ("Checks"); in short: all clean, 680 unit/integration tests with coverage gates, 215 E2E, 9 production E2E, 14 visual, Firefox and WebKit on five specs, 0 import cycles. Budgets: `perf/budgets.json` and
angular.json. If the bundle grows past a budget, measure with `node perf/bundle-report.ts`
before raising it.

---

## 4. Running it

```bash
nvm use                          # Node 24.21.0, see .nvmrc
npm install
npx playwright install chromium

npm run start:api                # mock API   http://localhost:4300
npm start                        # the app    http://localhost:4200
npm run verify                   # everything
```

Node `^22.22.3 || ^24.15.0 || >=26.0.0` is required and `engine-strict=true`, so
`npm install` refuses to run on the wrong runtime. Do not work around that by lowering
Angular.

Sign in with `admin`, `manager` or `viewer` and **any** password. The mock backend does
not verify passwords, which is exactly why there is no credential in this repository.

Things worth knowing before the first test run:

- **The mock API dataset is in memory** and reseeded from a fixed seed on every start,
  so a restart undoes whatever the E2E suite did. Deterministic, and disposable.
- **Playwright reuses an already-running dev server locally**
  (`reuseExistingServer: !CI`). A server left over from an earlier run will happily
  serve stale code and produce failures that look like real bugs. If a result is
  inexplicable, kill whatever is on 4200 and 4300 and run again.
- The E2E suite runs in parallel against **one** dataset. `anyCustomer(api, baseURL,
position)` hands each test a different record for that reason; keep using it.

The notes in `docs/PROGRESS.md` about nvm and `PATH` are **Windows machine state**, not
repository state. A Linux cloud session can ignore them.

---

## 5. What is still open

### Next: the review's order of work

All nine phases are done. There is no Phase 9 prompt. What comes next is
`docs/enterprise-review.md` §7, and the first item is not code: fast-forward `master` to
`phase-8-complete` and make the CI checks required (debt 33 is blocked until the default
branch contains the workflow).

Things the next change will meet directly:

- Store writes go through `runToCompletion()` (ADR-0043); a new one must too, with a
  "caller went away" test (docs/testing-strategy.md conventions).
- `config.json` must name a same-origin `apiBaseUrl`; the schema rejects anything else.
- `server.ts` caches only fingerprinted bundles (ADR-0044); CSP and security headers go
  there too (debt 17).
- Visual baselines are only valid inside the Playwright image: `npm run e2e:visual`
  (Docker). A UI change that is intended needs `npm run e2e:visual:update` in the same
  commit.
- `npm run lint` includes the architecture check: a new feature must be added to
  `FEATURES` and `FEATURE_ENTRY_POINTS` in `lint/architecture.ts`.

### Debt and open questions

Both live in `docs/PROGRESS.md` and are not duplicated here, because a second copy
would drift. Phase 8 paid no row - it fixed four defects that were not on the register -
re-dated the rows earlier phases had given it, and added rows 35-38.

### Traps that have already cost time

Each of these is written up in the Phase log in `docs/PROGRESS.md`. Listed here so a
fresh session recognises the symptom instead of re-deriving the cause:

- **A backtick inside a component's `template:` or `styles:` ends the literal.** The
  compiler reports `Failed to resolve @Component.styles to a string` and names no file.
- **jsdom makes CDK's focus utilities untestable** — it reports every element as
  zero-sized, so a focus trap finds nothing focusable. Focus behaviour belongs in the
  E2E suite.
- **jsdom does not implement form submission from a button**, so a component test must
  dispatch the `submit` event itself.
- **An async validator resolving does not emit on `statusChanges`** — Angular 22
  publishes a `StatusChangeEvent` on `control.events` instead.
- **`CanDeactivateFn` receives `null` at runtime** for a route that resolved but never
  rendered, whatever its type says.
- **Playwright matches accessible names by substring**, and its `request` fixture has
  its own cookie jar — `context.request` is the one that shares with the browser.
- **`skipLocationChange` keeps the previous URL**, not the requested one; `browserUrl`
  is the option that does. In a unit test, `router.url` is the rendered route and
  `Location.path()` is the address bar.
- **Every component that renders `*appIfPermitted` or uses `CustomerStore` needs a
  session in its test.** `provideSignedInAs('admin' | 'manager' | 'viewer')` in
  `core/testing/session-testing.ts` restores one before the first render.
- **After changing `@ecm/contracts`' exports, delete `apps/web/.angular/cache`**
  before `npm start` or the E2E suite, or the dev server serves a stale pre-bundle
  and the app fails with "does not provide an export named …" (debt row 24).
- **Notification and realtime assertions in E2E must be scoped to the test's own
  customer** - parallel tests are changing other customers at the same time.
- **The production server refuses unknown hosts**: start it with
  `NG_ALLOWED_HOSTS=localhost`. It serves no `/api`; the perf scripts and
  `e2e-production/` forward `/api` to the mock API with `route.fetch` + `fulfill`
  (`route.continue` cannot change the host).
- **`page.goto` resolves before a lazy page exists**: in a two-tab test, wait for the
  receiving page to render before the other tab writes, or the event is missed.
- **Performance numbers from a run beside anything else are noise.** Do not run the
  `perf/` scripts while the E2E suite runs.
- **jsdom has no media queries**, so `LayoutBreakpoints` reports the phone layout in
  every component test. A test of anything layout-dependent (the customer list since
  Phase 6) adds `provideLayoutMode('desktop')` from `layout/testing/`.
- **"Go to page 2" matches "Go to page 2,500"** - Playwright names match by substring,
  and page numbers are now grouped. Use `exact: true` for anything numeric.
- **`.visually-hidden` text escapes a scroll region** that is not its containing block
  and scrolls the whole page sideways; `app-table` is one now, a new scroll region
  must be too (`position: relative`).
- **A translation key added to `en.json` must go into `vi.json` too** -
  `translations.spec.ts` fails otherwise, with the key named.
- **Playwright's Chromium download may be blocked in a cloud session.** Phase 3 pointed
  `PLAYWRIGHT_BROWSERS_PATH` at symlinks to the preinstalled build; see PROGRESS.
  Phase 7 found a way to Firefox and WebKit there: start `dockerd`, pull
  `mcr.microsoft.com/playwright:v1.63.0-noble`, and run Playwright inside it with the
  repository mounted.
- **A subclass of `Logger` or `ErrorTracker` needs its own `@Injectable()`** - without
  it Angular reuses the base class's root factory, and `useClass: TestLogger` builds the
  real logger.
- **`if (flag)` does not remove a compiled Angular class from a bundle.** Build-time
  flags use `fileReplacements`; `perf/check-budgets.ts` checks.
- **Type into a server-rendered page only after it hydrates** (the Sign in button is
  enabled) unless hydration is what the test is about - a loaded machine drops keys.
- **Test secrets must be distinctive**: `'abc'` occurred by chance inside a random UUID
  and made a redaction test flaky.

---

## 6. If you change this file

Update it at a handoff, and say which commit it describes. It is the one document here
that is allowed to go stale between phases; everything else is kept current as part of
a phase's Definition of Done.
