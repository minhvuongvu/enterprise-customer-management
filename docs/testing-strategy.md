# Testing strategy

## What each level is for

| Level         | Tool                             | Answers                                                  | Lives in                        |
| ------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------- |
| Unit          | Vitest                           | does this logic hold, including its edge cases           | next to the source, `*.spec.ts` |
| Component     | Vitest + `TestBed`               | does the component render and behave as the user sees it | next to the component           |
| Integration   | Vitest + `HttpTestingController` | do these pieces agree with each other                    | next to the feature             |
| E2E           | Playwright                       | does the real journey work in a real browser             | `e2e/`                          |
| Accessibility | `@axe-core/playwright`           | is the rendered page usable                              | inside the E2E specs            |

Accessibility is not a separate suite. It runs inside the E2E tests, against the same
pages a user gets, because an a11y check against something other than the shipped DOM
tests nothing.

## What to test

Behaviour and contracts. A test should fail when the application becomes wrong, and
only then.

Concretely, from Phase 0's own suite:

- `parseDateOnly('2026-02-30')` returns `null` — the test names the bug it prevents
  (`new Date()` rolling the day over) rather than restating the implementation.
- `redact()` hides `password`, `accessToken`, `refresh_token` and `Authorization`, and
  keeps everything else. The rule is "credentials never reach a log sink"; the test
  checks that rule, not the substring matcher behind it.
- A 404 response reaches the caller as `kind: 'not-found'` with a translation key, and
  the backend's body does not. That is the contract the whole error taxonomy rests on.
- Storage degrades to a no-op when `window` is absent and when the browser throws on
  access. Both are real: server rendering, and a private window.

## What not to test

- Private methods, or that a method was called. Assert the outcome.
- Framework behaviour. Angular's router works.
- Snapshots of markup that nobody reads when they break.
- Anything that needs the source open beside it to understand.

## Conventions

- Tests sit next to their subject. A folder with no tests is visible.
- `describe` names the unit; `it` completes a sentence about behaviour, not about code.
- Where the assertion is non-obvious, the comment says _why the bug it prevents is
  worth preventing_, not what the line does.
- Fakes are written by hand when they are small (see `RecordingLogger`). A hand-written
  double that states its contract beats a mock whose setup is longer than the test.
- Every test is deterministic. No wall-clock dependence, no ordering dependence, no
  shared mutable state between tests.
- **Every store operation has a "caller went away" test** (Phase 8). Subscribe, then
  unsubscribe before the response: a read must be cancelled, a write must still
  complete and settle the store (ADR-0043), a file transfer must be cancelled. The
  three tests in `customer-store.phase4.spec.ts` ("a write whose caller stopped
  listening") are the template. 669 tests (Phase 7) that all waited for the response let
  docs/enterprise-review.md D1 live through six phases.

## Current state — end of Phase 2

| Suite                       | Files | Tests | Status  |
| --------------------------- | ----- | ----- | ------- |
| `@ecm/web` unit / component | 35    | 248   | passing |
| `@ecm/mock-api` integration | 8     | 101   | passing |
| `@ecm/contracts` contract   | 1     | 27    | passing |
| E2E + accessibility         | 5     | 38    | passing |

**API tests run against the real server** on an ephemeral port, not against handlers
invoked in process. Cookies, CORS, status codes and streaming are what that server
exists to provide, and none of them are exercised by calling an Express handler
directly.

**Contract tests import the package by name**, so they run against the built artifact
everyone else consumes rather than against source that might compile differently.

Covered: the Phase 0 seams; every documented status code and the error envelope; paging,
sorting, filtering, search, CRUD, optimistic concurrency, audit and bulk partial failure;
the role matrix enforced server-side with no UI involved; cookie flags, CSRF, refresh
rotation and replay; every fault-injection scenario; seed determinism and data realism;
upload, CSV partial import and export; the SSE wire format; and the application-to-API
wiring in a browser.

Phase 1 added the shell and the shared components: the route tree resolved as a unit
(redirects, deep links, the wildcard, and a feature flag that makes a branch stop
matching), the breadcrumb trail built from the real route tree, the three layouts, and
each shared component's behaviour rather than its markup.

**Focus behaviour is tested in the browser, not in jsdom.** CDK decides an element is
focusable by measuring it, and jsdom reports every element as zero-sized — so a unit
test asserting that focus moved into a dialog passes or fails for reasons unrelated to
the component. The focus trap, the focus restore and the skip link are therefore
verified in `e2e/layout.spec.ts`; the unit tests cover the wiring and everything else.

Phase 2 added the feature levels the earlier phases had nothing to put in:

- **API client tests** assert the request that goes out, the validation of what comes
  back, and the policy - that a read is retried and a write never is.
- **Store tests** assert the three properties that are invisible until they are
  wrong: a superseded request is cancelled (`TestRequest.cancelled`), a cached answer
  is shown while it revalidates, and every mutation invalidates what it made stale.
- **Form tests** read as a specification, because the validators and the two payload
  conversions are pure functions in `customer-form-model.ts` rather than behaviour
  inside a component.
- **Integration tests** drive the pages through the real router with
  `RouterTestingHarness`, so the property the whole design rests on is exercised:
  the page is never handed a page number, it is navigated to.
- **The CRUD journey** runs in a browser against the real mock backend - sign in,
  search, open, edit, save, delete - plus the two paths that only exist because there
  is a server: a bulk action that partly fails, and a write that loses a race.

**The application's real HTTP stack is used in tests**, through `provideTestHttp()`.
A bare `provideHttpClient()` would exercise a request path that does not exist in
production - no correlation id, no CSRF header and, most misleadingly, no error
mapping - so every assertion about error handling would be testing the spec's own
plumbing.

**The conflict test creates a real race.** It updates the record through the API
while the form is open, rather than asking the server to pretend with a
fault-injection header. That is what caught a real defect: the first implementation
recomputed the patch against the reloaded record and silently reverted the other
person's field. A test that only asserted "the save succeeded" would have passed.

**Records are isolated per test.** The suite runs in parallel against one dataset, so
`anyCustomer(api, baseURL, position)` gives each test a different record. Two tests
that both took "the first customer", one of them writing, would fail each other
intermittently - the worst kind of failure, because it looks like an application bug.

**The axe scan runs in both themes.** A palette that passes contrast in light routinely
fails in dark, and finding that in Phase 6 would mean re-tuning tokens that six phases
of components already depend on. (Phase 6's full audit found one anyway: the danger
button was red-400 behind white text in dark, 2.6:1. `--danger-solid` fixed it.)

### Phase 6: the accessibility, keyboard, responsive and i18n suites

| Spec                    | What it proves                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accessibility.spec.ts` | axe (WCAG 2.2 A/AA + best practice) on **every route**, light and dark, plus open dialog/menu/panel/form errors/drawer; critical and serious fail, the rest are attached and listed in docs/accessibility.md; reduced motion honoured            |
| `keyboard.spec.ts`      | every journey with Tab/Enter/Space/Escape/arrows only - sign-in, skip link, menus, sort, pagination, selection, a trapped dialog, the form, toasts - asserting where focus is after each step                                                    |
| `responsive.spec.ts`    | no sideways scroll on nine routes at 375/820/1280 px; the phone's card list, sort select, folded filters, action menu, drawer account section; scroll lock under dialogs and the drawer                                                          |
| `i18n.spec.ts`          | runtime switch with no reload (a window marker survives), `<html lang>`, title, locale number grouping, persistence, the prerendered page; `dateOfBirth` identical in four time zones from UTC-11 to UTC+14, and unchanged by a save from UTC-11 |

Each was checked for teeth: the pagination and sort focus tests fail with the focus
restore removed; the dark-theme scan failed before `--danger-solid`; the phone overflow
test failed before `app-table` contained its hidden text.

## How this grows

Phase 3 added authorization tests that assert the _UI_ reflects a role
(`customer-authorization.spec.ts`, `e2e/auth.spec.ts`) while the server enforces it
independently (`apps/mock-api/test/authorization.spec.ts`, and a direct API call as a
manager in the E2E suite). The refresh races are tested by counting requests at the
transport (`auth-refresh.interceptor.spec.ts`), which is the only level at which "exactly
one refresh" can be asserted. Session expiry is reproduced in E2E by removing the
cookies the browser would have dropped, rather than by waiting.

Phase 4 added two things that are about _time_: reconnection and duplicate
delivery. Unit tests drive a hand-written fake `EventSource` (injected through
`EVENT_SOURCE_FACTORY`) with fake timers, so "drops, gives up, backs off, renews,
resumes from the last id" is asserted step by step. The E2E suite then proves the
same against the real server, using two admin routes that end a session's
streams and re-deliver an event on demand. Two-user scenarios use a second
browser context signed in as another role; assertions about notifications count
only the test's own customer, because parallel tests change others at the same
time.

Phase 5 made the split between three kinds of browser-facing test explicit,
because most of what it added is the browser's own behaviour:

| Kind                | Runs against                         | Used for                                                                                                                                                                                                                 | Where                                            |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Unit                | jsdom, fakes injected through tokens | the logic _around_ an API: the election algorithm (fake timers, shared fake storage, a hand-made race), payload validation, URL parsing, offline policy, the refresh lock                                                | next to the source                               |
| Browser integration | real Chromium, `ng serve`            | the API itself: storage surviving a reload, IndexedDB, clipboard and geolocation with granted permissions, a Web Worker, `BroadcastChannel` and the `storage` event between two pages of one context, the offline switch | `e2e/labs.spec.ts`, `e2e/cross-tab.spec.ts`      |
| E2E                 | real Chromium, `ng serve` + mock API | journeys: a change in one tab announced in the other; sign-out in one tab ending both; rendering specimens interactive in every mode                                                                                     | `e2e/cross-tab.spec.ts`, `e2e/rendering.spec.ts` |
| Production build    | real Chromium, `dist/` + mock API    | what only the production build does: the service worker starting the app offline and caching no API response; route preloading                                                                                           | `e2e-production/` (`npm run e2e:production`)     |

Two cross-tab fakes make the unit level possible: `FakeBroadcastNetwork`
(`core/testing/broadcast-testing.ts`), which keeps the one rule that matters -
never deliver to the sender - and a recording `LockManager`.

**Speed is not asserted in tests.** A test that runs beside forty others
measures the schedule. Performance claims come from the scripts in `perf/`,
run on their own, against the production build, with repeated runs and
medians; the numbers are in [performance.md](performance.md) and
[rendering.md](rendering.md). The tests assert the _mechanism_ instead - a
debounced search scans once, a `computed()` is not recomputed, a virtual list
holds under 200 elements, the optimized images are the 400/800 px WebP files.

Phase 7 reviewed the whole pyramid, gated coverage, added visual regression and the
cross-browser run, and wired all of it into CI - below.

## The testing pyramid at `phase-7-complete`

Real numbers, from the test runners (and, for the web split, from classifying each spec
file by what it mounts: a spec that renders a component _and_ goes through the HTTP
stack is an integration test).

```text
                        ┌──────────────┐  14 visual (Docker image)
                        │  visual      │
                   ┌────┴──────────────┴────┐  7 production-build (+ 3 performance budgets)
                   │  E2E  (Playwright)     │  215 Chromium = 139 functional + 76 accessibility
                   │                        │  + Firefox/WebKit on 5 specs (48 tests each)
              ┌────┴────────────────────────┴────┐
              │  integration                     │  web: 22 files (component+store+HTTP: 9,
              │                                  │       service+HTTP: 13) · mock API: 133 over HTTP
         ┌────┴──────────────────────────────────┴────┐
         │  component (TestBed)                        │  web: 14 files
    ┌────┴─────────────────────────────────────────────┴────┐
    │  unit                                                  │  web: 34 files · contracts: 44 · lint tools: 16
    └────────────────────────────────────────────────────────┘
```

| Suite                              | Runner             | Tests            | Coverage (lines) | Gate                                                   |
| ---------------------------------- | ------------------ | ---------------- | ---------------- | ------------------------------------------------------ |
| web: unit, component, integration  | Vitest + jsdom     | 475              | 81.5 %           | ≥ 80 % lines, 78 statements, 76 branches, 77 functions |
| mock API (over a real socket)      | Vitest             | 133              | 89.9 %           | ≥ 88 % lines                                           |
| contracts (built package)          | Vitest             | 45               | 99.2 %           | ≥ 95 % lines                                           |
| lint tools (architecture, secrets) | `node --test`      | 16               | -                | -                                                      |
| E2E, Chromium                      | Playwright         | 215              | -                | every test                                             |
| production build                   | Playwright         | 7                | -                | every test, performance budgets                        |
| visual                             | Playwright, Docker | 14               | -                | 0.2 % pixel difference                                 |
| Firefox + WebKit                   | Playwright, Docker | 96 runs (48 × 2) | -                | every test (3 skipped, 1 expected-fail - see below)    |

**Where coverage is thin, and why** (web, by area):

| Area             | Lines    | Why                                                                                                                                                                                |
| ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/*`         | 86-100 % | the infrastructure - tested hardest                                                                                                                                                |
| `customers`      | 88 %     | the product                                                                                                                                                                        |
| `shared/ui`      | 93 %     | tooltip 56 % - positioning is CDK overlay geometry, jsdom has none; E2E covers it                                                                                                  |
| `layout`         | 71 %     | toast region 41 %, notification center 29 %, confirmation host 24 % - driven through the real services in E2E (`enterprise-ux.spec.ts`, `keyboard.spec.ts`), not in jsdom          |
| `technical-labs` | 38 %     | each lab is a page around a browser API; the logic around the API is unit-tested (election, snapshot policy, worker maths), the API itself only in a real browser (`labs.spec.ts`) |

Coverage is a floor, not a target: the thresholds are a **ratchet** set just under the
current numbers, so a change that drops coverage fails and a change that raises it can
raise them.

### Visual regression

Selective, as the prompt asks: **critical pages** (sign-in light/dark/Vietnamese, the
customer list on desktop light/dark and phone Vietnamese, the record, the form with every
kind of error) and **design-system components in a state** (danger dialog, a checked
choice menu in both themes, empty state, pagination, button variants) - 14 screenshots.
A component shot is cropped to the component, so it fails only when the component
changed.

Baselines are valid in one environment: the Playwright image CI uses. `npm run
e2e:visual` runs the suite inside it on any machine with Docker; `npm run
e2e:visual:update` rewrites the baselines. The config refuses to run outside it. The
dataset is the fixed seed on a fresh server, the clock UTC, the locale `en-US`,
animations off; the realtime connection indicator is masked.

On its **first run** it found a Phase 6 bug nothing else had: the checked menu item
showed "¹3" instead of a tick - the CSS escape had been written into the file as two
literal characters. Every functional test passed; axe did not care; only the pixels were
wrong.

### Cross-browser

CI runs the journeys and the engine-sensitive specs (smoke, auth, CRUD, cross-tab, labs)
in Firefox and WebKit - debt row 28 paid: Web Locks, `BroadcastChannel`, the Permissions
API and the offline lab pass in all three engines. Four exceptions, each explained in the
test:

- **clipboard** (skipped outside Chromium): Playwright can grant clipboard permissions
  only in Chromium - a harness limit;
- **geolocation refused** (skipped in Firefox): headless Firefox leaves a permission prompt
  open, and the preference that makes it refuse also overrides a grant;
- **optimized images** (asserted to fail in WebKit, `test.fail`): WebKit fetches the 1600 px
  candidate for the first, eager image - debt row 34. If WebKit changes, the test starts
  passing and Playwright reports it.

### Mocking

Three layers, one source each - no customer is written out by hand twice:

| Layer            | Test data                                                                                                                            | Deterministic by                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| unit/integration | `@ecm/contracts/testing`: `aCustomer`, `anotherCustomer`, `customersFrom(n)` (generated), `aPage`, `aCreateCustomerRequest`          | fixed values; `customersFrom` derives every field from the index |
| mock API tests   | the seeded store (`MOCK_API_SEED`), 300 records per test server                                                                      | the seed                                                         |
| E2E              | the running mock API's seeded 50 000; `anyCustomer(position)` gives each test its own record                                         | the seed + per-test positions                                    |
| test doubles     | hand-written: `SilentLogger`, `FakeEventSource`, `FakeBroadcastNetwork`, `MemorySnapshots`, `provideSignedInAs`, `provideLayoutMode` | no timers or randomness unless faked                             |

`@ecm/contracts/testing` is a separate package entry, validated by
`packages/contracts/test/fixtures.spec.ts` (every builder's output parses against the
schema it stands in for), and refused outside test code by `lint/architecture.ts`. It
replaced a hand-copied customer in the offline lab's spec, which could not borrow the
customer feature's fixture (rule 4).

### Performance in tests

"Speed is not asserted in tests" still holds for the unit and E2E suites. Phase 7 adds
one deliberate exception: `e2e-production/performance-budgets.spec.ts` runs on the
production build, alone, and asserts the _field_ budgets - which a local production
build clears by a wide margin (measured in docs/performance.md, "Budgets"), so a failure is a regression,
not scheduling noise. It reads the numbers from the application's own monitor, so it
also proves the monitor works.

## Known gaps

| Gap                                                     | Why it is acceptable now                                                               | Owner                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| Layout's notification components under-covered in jsdom | Driven end to end through the real services; a jsdom test would test CDK overlays      | not planned                      |
| Bulk `CONFLICT` outcome only reached by injection       | A natural version race needs two concurrent clients writing the same batch             | not planned (Phase 8 review)     |
| No real screen reader                                   | Roles, names and states are asserted (debt row 29)                                     | manual, before a release         |
| "Caller went away" tests cover writes only (D1)         | The convention above exists from Phase 8; reads and transfers are older code           | debt row 38                      |
| Response headers: caching only                          | `e2e-production` asserts caching (ADR-0044); CSP and security headers do not exist yet | with debt row 17                 |
| Mutation testing                                        | Coverage says a line ran, not that a test would notice it changing                     | not planned - see final report   |
| Firefox and WebKit run 5 of 16 specs                    | The others exercise no engine-specific API; the full matrix would triple CI time       | revisit if an engine bug escapes |
| Layouts checked at three fixed widths                   | The widths are the breakpoints                                                         | not planned                      |
