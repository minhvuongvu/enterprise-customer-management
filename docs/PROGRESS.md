# Progress Log

The phase-state file. **Read this before starting any session.** Each phase updates it
as part of its Definition of Done.

Its purpose: every Claude Code session starts with no memory of previous sessions.
Without this file, later phases cannot know what earlier phases actually decided,
skipped, or broke.

---

## Phase status

| Phase | Name                                            | Status      | Branch / tag | Completed  |
| ----- | ----------------------------------------------- | ----------- | ------------ | ---------- |
| 0     | Foundation & Architecture                       | **Done**    | `phase-0`    | 2026-09-20 |
| 0.5   | Mock API & Contracts                            | **Done**    | `phase-0.5`  | 2026-09-20 |
| 1     | Routing, Layout & Design System                 | Not started | `phase-1`    | —          |
| 2     | Customer CRUD, Forms & Server State             | Not started | `phase-2`    | —          |
| 3     | Authentication, Authorization & Security        | Not started | `phase-3`    | —          |
| 4     | Enterprise UX, Files, Notifications & Realtime  | Not started | `phase-4`    | —          |
| 5     | Performance, Rendering, Offline & Browser APIs  | Not started | `phase-5`    | —          |
| 6     | Accessibility, i18n, Design System & UX Quality | Not started | `phase-6`    | —          |
| 7     | Observability, Testing, CI/CD & Hardening       | Not started | `phase-7`    | —          |
| 8     | Enterprise Codebase Review                      | Not started | `phase-8`    | —          |

Status values: `Not started` · `In progress` · `Done` · `Done with deviations`

---

## Environment

| Item    | Required                               | Actual                                  | Checked    |
| ------- | -------------------------------------- | --------------------------------------- | ---------- |
| Node    | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` | **v24.21.0** — OK                       | 2026-09-20 |
| npm     | `>=8`                                  | 11.19.0                                 | 2026-09-20 |
| Angular | 22.1.7                                 | 22.1.7 installed (CLI/build/ssr 22.1.8) | 2026-09-20 |

Node is managed by **nvm for Windows v2.0.0**
(`C:\Users\Admin\AppData\Local\Author Software\nvm`). The pinned version is in
`.nvmrc`. Full resolved dependency list is in ADR-0001.

### Toolchain notes — non-obvious machine state

Two things were fixed on 2026-09-20 and will look confusing if rediscovered later:

1. **A standalone Node v20.18.0 install still exists at `E:\Program Files\nodejs`.**
   Its entry was removed from the _machine_ `PATH` — along with a duplicate of it and
   a dead `D:\Program Files\nodejs` entry in the _user_ `PATH` — because it sat ahead
   of nvm and shadowed it, which made `nvm use` appear to do nothing. The directory is
   still on disk; uninstalling it through Windows "Apps & features" is optional
   cleanup, but **do not put it back on `PATH`**.
2. **The global `~/.npmrc` sets `legacy-peer-deps=true`.** That silently accepts
   incompatible peer dependencies — the exact mechanism by which an unsupported
   TypeScript or Vitest would install against Angular 22 without a warning. The
   repository `.npmrc` overrides it with `legacy-peer-deps=false`, and adds
   `engine-strict=true` so a wrong Node runtime fails the install instead of failing
   later.

---

## Phase log

Newest entry first. One entry per phase, appended at the end of that phase.

### Phase 0.5 - Mock API & Contracts

**Completed:** 2026-09-20 - **Tag:** `phase-0.5`

**Built**

- `packages/contracts` - Zod schemas that are both the runtime validators and the source
  of every API type. Branded `Instant` / `DateOnly`, the error envelope, pagination, the
  customer resource, audit, files, realtime events, and the role/permission matrix.
- `apps/mock-api` - a real Express server: cookie sessions (`HttpOnly`, `SameSite`,
  refresh-token rotation), CSRF double-submit, explicit CORS, hand-written security
  headers, server-side authorization, optimistic concurrency, multipart avatar upload,
  CSV import with partial success, CSV export, and an SSE stream.
- Deterministic dataset: 50,000 customers from a seed, prefix-stable, deliberately
  untidy (non-ASCII names, empty optional fields, repeated names).
- Fault injection through `x-mock-scenario`, 14 scenarios, catalogue served from
  `/api/_mock/scenarios` so documentation cannot drift from behaviour.
- Wired into the app: dev proxy, `HealthApi` (the pattern Phase 2's clients follow),
  and `mapHttpError` now reads and **validates** the error envelope, filling in the
  `fieldErrors` that Phase 0 deliberately left empty.
- Root ESLint for the Node packages, which were previously unlinted.
- `docs/api-contract.md`, `docs/mock-backend.md`, ADRs 0006-0008.

**Architectural decisions**

- [ADR-0006](decisions/0006-sse-over-websocket.md) - SSE rather than WebSocket.
- [ADR-0007](decisions/0007-mock-backend-architecture.md) - in-memory, no build step,
  deterministic faults, real mechanisms except password verification.
- [ADR-0008](decisions/0008-contracts-as-compiled-library.md) - contracts is compiled;
  the apps run from source.

**Deviated from the plan**

- `core/time/instant.ts` now imports its branded types from `@ecm/contracts` instead of
  declaring its own. This is a Phase 0 file, changed deliberately: the Definition of Done
  requires that contracts be the only definition of an API type, and two brands for the
  same wire value are exactly the duplication that rule exists to prevent. The operations
  stayed in the application.
- `HomePage` gained a real API call and four component tests. It is a placeholder page,
  but "one real end-to-end call from `apps/web` succeeds" is a Definition-of-Done item
  and nothing else in the app makes a request yet. Phase 1 replaces the page.
- A root `eslint.config.js` and root `tsconfig.json` were added. Not in the prompt, but
  without them the new packages and the e2e specs are neither linted nor typechecked,
  and the Definition of Done claims both.

**Deliberately not done**

- No customer UI, no forms, no server-state layer - Phase 2.
- No login screen, no guards with real logic - Phase 3. The API is ready for both.
- The import flow stops at "upload, validate, report". The preview/confirm UX is Phase 4.
- No persistence, no password verification. Both are stated in `docs/mock-backend.md`
  rather than implied.

**Checks**

| Check                  | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `npm run format:check` | clean                                                    |
| `npm run lint`         | clean - root + workspaces, 0 errors, 0 warnings          |
| `npm run typecheck`    | clean across all three packages                          |
| `npm test`             | 167 passed - 43 web, 101 mock-api, 23 contracts          |
| `npm run build`        | succeeded, browser + server bundles, 1 route prerendered |
| `npm run e2e`          | 9 passed, including the real app-to-API wiring           |
| Import cycles          | none                                                     |

**Findings worth carrying forward**

- **Two copies of zod in one workspace produce structurally incompatible types.**
  `@angular/cli` brings zod 4.4.3 transitively and npm hoisted it; the contracts pin of
  4.6.5 became a nested copy, and every schema crossing a package boundary failed to
  typecheck with a wall of `_zod.version.minor` errors. Fixed with a root `overrides`
  pinning one version for the whole tree.
- **Node's type stripping rejects constructor parameter properties**
  (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) and does no specifier rewriting: `./x`, `./x.js`
  and `./x.ts` are three different things, and only the last one resolves.
- **`allowImportingTsExtensions` requires `noEmit`**, so a package cannot both use `.ts`
  specifiers and be compiled by Angular. That conflict is what ADR-0008 resolves.
- Express 5 types a path parameter as `string | string[]`. Silencing it with a cast at
  each call site would have been eight copies of the same unchecked assumption.

**For the next phase (1)**

- The route tree, `authGuard` and the render-mode split are in place and unchanged.
- `HomePage` is a placeholder holding a temporary API call; replacing it is expected.
- A translating `TitleStrategy` is still open (question 4) and belongs with the shell.
- The design system can rely on `@angular/cdk`, already installed and unused so far.
- Everything Phase 2 needs from the backend exists: paging, sorting, filtering, search,
  409 on stale writes, and per-item bulk results.

---

### Phase 0 — Foundation & Architecture

**Completed:** 2026-09-20 · **Tag:** `phase-0`

**Built**

- npm workspace root; Angular 22 application at `apps/web` in its final position.
- Scaffolded with SSR and zoneless change detection; `/login` prerendered, everything
  else client-rendered with hydration and event replay (ADR-0003).
- All seven cross-cutting seams, wired in and under test:
  - `core/platform` — `IS_BROWSER`, `WINDOW`, `LOCAL_STORAGE`, `SESSION_STORAGE`, each
    degrading to a no-op on the server and when a browser refuses storage.
  - `core/i18n` — Transloco, English only, translations as lazily imported chunks
    (ADR-0004).
  - `core/logging` — `Logger` abstraction, `ConsoleLogger`, credential redaction,
    correlation IDs.
  - `core/errors` — the §4.7 taxonomy as a discriminated union, central HTTP mapping,
    global error handler that records and does not render.
  - `core/auth` — `SessionService` signals with a real `unknown` state; `authGuard`
    returning `true` and saying so, already attached to the protected branch.
  - `core/config` — build-time `BuildEnvironment` with `fileReplacements`, runtime
    `AppConfigStore` fed from `public/config.json`, feature flags (ADR-0005).
  - `core/time` — branded `Instant` (UTC) and `DateOnly` types encoding the timezone
    policy.
- `core/http` — correlation-ID and error-mapping interceptors, in an order that is
  documented and load-bearing.
- Lint enforcement for the two rules that get broken silently: no browser globals, no
  hardcoded user-facing strings. Both verified by writing a violation and watching
  lint reject it.
- Playwright + axe at the workspace root; ESLint, Prettier, Vitest, CI-shaped scripts.
- `README.md`, `docs/architecture.md`, `docs/development-guide.md`,
  `docs/testing-strategy.md`, ADRs 0002–0005.

**Architectural decisions**

- [ADR-0002](decisions/0002-angular-workspace-foundation.md) — workspace layout,
  zoneless, `ngc` for typechecking, explicit strictness.
- [ADR-0003](decisions/0003-render-modes.md) — prerender the public surface,
  client-render the application.
- [ADR-0004](decisions/0004-bundled-translations.md) — translations as lazy chunks,
  not HTTP.
- [ADR-0005](decisions/0005-runtime-configuration-boundary.md) — runtime config is a
  browser concern.

**Deviated from the plan**

- The prompt lists "Shared UI foundation". `shared/ui/` was created with its rules
  written down and **no components**. Phase 1 owns the design system, and a shared
  component invented before a second caller exists is how the folder becomes a junk
  drawer. The rules, not the components, are the Phase 0 deliverable.
- A route `TitleStrategy` was considered and left out. Route titles must be
  translation keys to satisfy the no-hardcoded-strings rule, which makes the title
  strategy a piece of the shell — Phase 1's work, not Phase 0's.
- `apps/web/README.md` (CLI boilerplate) was deleted in favour of the root README, so
  there is one description of how to run things.

**Deliberately not done**

- No customer domain, no HTTP data access, no design system, no real auth — later
  phases.
- No timeout/retry interceptor. Those are per-endpoint decisions belonging to Phase
  2's data-access layer; an interceptor that retries everything retries the wrong
  things.
- No CI pipeline (Phase 7), no dependency/architecture tests (Phase 7).

**Checks**

| Check                  | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `npm run format:check` | clean                                                    |
| `npm run lint`         | clean — 0 errors, 0 warnings                             |
| `npm run typecheck`    | clean (`ngc`, templates included)                        |
| `npm test`             | 39 passed, 8 files                                       |
| `npm run build`        | succeeded, browser + server bundles, 1 route prerendered |
| `npm run e2e`          | 5 passed, including an axe scan with 0 violations        |

**Findings worth carrying forward**

- TypeScript 6 enables `strict` by default and Angular 22 enables `strictTemplates`
  by default. Both verified by probe, then set explicitly anyway.
- `tsc --noEmit` does **not** check templates. `npm run typecheck` runs `ngc`, which
  does. Verified with a deliberate binding error that `tsc` ignored.
- `resource()` is still `@experimental` in Angular 22.1.7 — this was the §5.5 check
  Phase 0 owed. Phase 2 writes its server-state layer explicitly.
- Angular 22's `ng new` already defaults to Vitest and to zoneless, and no longer
  installs zone.js.

**For the next phase (0.5)**

- The workspace root is ready: add `apps/mock-api` and `packages/contracts` as
  workspaces; nothing needs to move.
- `AppConfig.apiBaseUrl` exists and is unused. It is the seam the API client plugs
  into.
- `mapHttpError` returns an empty `fieldErrors` for 400/422 on purpose — the
  field-level envelope is Phase 0.5's to define. Fill it in once the contract exists.
- `CORRELATION_ID_HEADER` is `X-Correlation-Id`. The mock API should echo it into its
  own logs so a failure can be traced across both sides.
- The dev server runs on 4200 and Playwright manages it; the mock API needs a
  different port and a dev proxy.

---

## Technical-debt register

Debt is only acceptable when it is written down. Remove the row when it is paid.

| #   | Debt                                                                                                                                                             | Added in  | Why accepted                                                             | Pay by                           | Status |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------ | -------------------------------- | ------ |
| 1   | `provideRuntimeConfig()` has no end-to-end test - the browser fetch path is unexercised                                                                          | Phase 0   | The app does read `config.json` at boot, but no test asserts it          | Phase 1                          | Open   |
| 2   | Dependency direction is enforced by review, not by a tool                                                                                                        | Phase 0   | There is one package and few boundaries to break                         | Phase 7                          | Open   |
| 3   | Four npm packages have unapproved install scripts (`esbuild`, `lmdb`, `msgpackr-extract`, `@parcel/watcher`) under npm 11's new gating; builds work without them | Phase 0   | No observed impact on build, test or serve                               | Phase 7                          | Open   |
| 4   | `@angular-eslint/template/i18n` checks text nodes only; attributes (`aria-label`, `placeholder`, `title`) are not checked                                        | Phase 0   | No components with attributes to check yet                               | Phase 1                          | Open   |
| 5   | `packages/contracts` must be built before the apps typecheck; a bare `tsc` in `apps/web` fails on a fresh clone                                                  | Phase 0.5 | The root scripts handle it; only a hand-run command is affected          | Phase 7 (CI)                     | Open   |
| 6   | The mock API rate limiter is fixed-window, so a client can send up to twice the limit across a boundary                                                          | Phase 0.5 | It exists to make 429 a real code path, not to be a real limiter         | not planned - documented instead | Open   |
| 7   | Avatar uploads are validated by declared MIME type only; no content inspection                                                                                   | Phase 0.5 | Stated in `docs/mock-backend.md` as a gap rather than implied to be safe | Phase 3                          | Open   |

---

## Open questions

Things that could not be decided yet and must be decided by a specific phase.

| #   | Question                                                                                          | Must be answered by | Notes                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Do Angular 22's `resource()` / `httpResource()` APIs cover the server-state needs?~~            | ~~Phase 0~~         | **Answered 2026-09-20:** `resource()` is `@experimental` in 22.1.7. Phase 2 writes the server-state layer explicitly. |
| 2   | Does the hand-written cache survive realtime + optimistic updates, or is NgRx SignalStore needed? | Phase 4             | Revisit once, via ADR. See context §5.5                                                                               |
| 3   | ~~Is SSR-in-dev noisy enough to hurt early phases?~~                                              | ~~Phase 1~~         | **Answered 2026-09-20:** no. Dev server, build and E2E all run normally with SSR enabled.                             |
| 4   | Should route titles use a translating `TitleStrategy`, or per-page metadata?                      | Phase 1             | Needed for §7.1's scoped SEO; must not reintroduce hardcoded strings                                                  |
| 5   | Does the client hold one SSE connection per tab, or elect one tab to hold it and share?           | Phase 4 / 5         | HTTP/1.1 allows six connections per origin; see ADR-0006                                                              |
| 6   | Where does DTO-to-domain mapping live once the customer feature exists?                           | Phase 2             | Contracts gives validated DTOs; the feature may want a different shape                                                |
