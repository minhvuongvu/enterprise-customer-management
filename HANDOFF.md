# Handoff

Orientation for a session picking this repository up cold — in particular a cloud
session that has the git history but none of the conversation that produced it.

**This file is orientation, not authority.** When it disagrees with
`ANGULAR_PROJECT_CONTEXT.md`, that file wins. When it disagrees with
`docs/PROGRESS.md` about what is done, PROGRESS wins — it is updated as part of every
phase's Definition of Done, and this file is updated only at a handoff.

Last updated at **`phase-4-complete`**.

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

| ADR  | Decision                                                                  |
| ---- | ------------------------------------------------------------------------- |
| 0001 | the locked stack, with the versions actually resolved at install          |
| 0002 | workspace layout, zoneless, `ngc` for typechecking                        |
| 0003 | prerender the public surface; client-render the application               |
| 0004 | translations as lazy chunks, not HTTP                                     |
| 0005 | runtime configuration is a browser concern                                |
| 0006 | SSE rather than WebSocket                                                 |
| 0007 | mock backend: in-memory, no build step, deterministic faults              |
| 0008 | contracts is compiled; the apps run from source                           |
| 0009 | route titles are translation keys, resolved by a `TitleStrategy`          |
| 0010 | two token layers; the theme is one attribute on `<html>`                  |
| 0011 | three layouts; CSS for presentation, TypeScript only for drawer behaviour |
| 0012 | what Phase 2 borrowed from Phase 3, and what it deliberately did not      |
| 0013 | one feature store, explicit cache, cancellation by switching              |
| 0014 | the contract type **is** the domain type; no mapping layer                |
| 0015 | a losing write reloads and resubmits only this user's fields              |
| 0016 | tokens are `HttpOnly` cookies; the app never holds one (supersedes 0012)  |
| 0017 | reactive refresh, single flight, one retry; one job per interceptor       |
| 0018 | route, UI and action authorization by permission - none of it security    |
| 0019 | one file policy for both sides; a byte check only the server makes        |
| 0020 | realtime client: own reconnect, de-duplication, news never overwrites     |
| 0021 | uploads with progress on XHR, everything else on fetch                    |
| 0022 | notifications are justified global state; one confirmation service        |
| 0023 | the one optimistic operation: status change, with rollback                |
| 0024 | CSV import as preview + commit, nothing held on the server                |

### The ten rules

`CLAUDE.md` lists ten non-negotiable rules. Two are enforced by lint and will fail the
build if broken — no hardcoded user-facing strings, no direct browser globals. The
other eight are enforced by review, and the ones most often broken by accident are:

- no `HttpClient` in components (presentation → feature state → API client → HTTP);
- no abstraction without a **named** second caller;
- no raw backend errors shown to users — everything maps through the error taxonomy;
- all instants are UTC ISO-8601, and `dateOfBirth` is date-only and must never be
  timezone-shifted.

---

## 3. Where things stand

### Phases

| Phase | Name                                     | Status      |
| ----- | ---------------------------------------- | ----------- |
| 0     | Foundation & Architecture                | **Done**    |
| 0.5   | Mock API & Contracts                     | **Done**    |
| 1     | Routing, Layout & Design System          | **Done**    |
| 2     | Customer CRUD, Forms & Server State      | **Done**    |
| 3     | Authentication, Authorization & Security | **Done**    |
| 4     | Enterprise UX, Files, Notifications & RT | **Done**    |
| 5–8   | see `docs/PROGRESS.md`                   | Not started |

`docs/PROGRESS.md` is the phase-state file: what each phase built, what deviated, the
technical-debt register and the open questions. **Read it before starting anything.**

### Git

History is linear; each phase branch contains everything before it.

```text
phase-4           <- HEAD, everything is here
phase-3  80a3703
phase-2  8da182b
phase-1  4d75b6c
phase-0.5 c0791f9
phase-0  6ef58ce
master   ef498df  <- pre-Phase-0. Nothing has been merged into it.
```

Two things a cloud session will trip over:

- **`master` is stale on purpose.** No phase has been merged. Branch Phase 5 from
  `phase-4`, not from `master`.
- **Branches and `phase-N-complete` tags are both on the remote**, so a fresh clone
  sees the whole phase history. `git fetch --tags` if a clone predates them.

### Verification at `phase-4-complete`

`npm run verify` runs format → lint → typecheck → test → build → e2e.

| Check         | Result                                              |
| ------------- | --------------------------------------------------- |
| format, lint  | clean; 0 errors, 0 warnings                         |
| typecheck     | clean across all three packages, templates included |
| unit tests    | 509 — 354 web, 122 mock-api, 33 contracts           |
| build         | succeeds, browser + server, 1 route prerendered     |
| e2e           | 57, incl. two-user realtime, uploads, import, axe   |
| import cycles | none (method in PROGRESS, Phase 3 checks)           |

**One warning is expected and is not a regression:** the initial bundle is ~808 kB
against a 500 kB budget. It is pre-existing, measured, and left failing so it stays
visible — technical-debt row 8, to be paid in Phase 5. Do not silence it by raising
the budget.

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

### Next: Phase 5 — Performance, Rendering, Offline & Browser APIs

The prompt is `prompts/Phase 5 — Performance, Rendering, Offline & Browser APIs.md`.
Read the Phase 4 entry in `docs/PROGRESS.md` first - its "For the next phase" list is
written for you - then `docs/realtime.md` and `docs/state-management.md`.

Things Phase 5 will meet directly:

- **One SSE stream per tab** (open question 5, debt rows 18 and 25). A leader tab
  sharing one stream over `BroadcastChannel` would also carry sign-out between tabs.
- **The initial bundle** (debt row 8) now includes the notification and realtime
  code in the shell.
- **Uploads use XHR and realtime a long-lived stream** (ADR-0020, ADR-0021) - the two
  things a service worker or offline queue must not intercept naively.
- `/login` is still prerendered, with pre-hydration typing lost (debt row 13).

### Debt and open questions

Both live in `docs/PROGRESS.md` and are not duplicated here, because a second copy
would drift. The ones a Phase 5 session will meet directly:

- row 8 - the initial bundle, now ~808 kB against a 500 kB budget;
- row 13 - typing into the prerendered sign-in form before hydration is lost;
- rows 18 and 25 - no cross-tab session or realtime coordination;
- open question 5 - one SSE connection per tab, or one shared.

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
- **Playwright's Chromium download may be blocked in a cloud session.** Phase 3 pointed
  `PLAYWRIGHT_BROWSERS_PATH` at symlinks to the preinstalled build; see PROGRESS.

---

## 6. If you change this file

Update it at a handoff, and say which commit it describes. It is the one document here
that is allowed to go stale between phases; everything else is kept current as part of
a phase's Definition of Done.
