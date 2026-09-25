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
| 1     | Routing, Layout & Design System                 | **Done**    | `phase-1`    | 2026-09-20 |
| 2     | Customer CRUD, Forms & Server State             | **Done**    | `phase-2`    | 2026-09-20 |
| 3     | Authentication, Authorization & Security        | **Done**    | `phase-3`    | 2026-09-25 |
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

### Phase 3 - Authentication, Authorization & Security

**Completed:** 2026-09-25 - **Tag:** `phase-3-complete`

**Built**

- The session lifecycle in `SessionService`: sign-in, current user, restore after a
  reload (`unknown` → `authenticated` / `anonymous`), sign-out, expiry, refresh and
  failed-refresh handling. It holds the user, the server-derived permissions and the
  access token's expiry - and **no token**: both tokens stay `HttpOnly` cookies
  (ADR-0016, superseding ADR-0012).
- `authRefreshInterceptor`: on an `authentication` failure it joins or starts **one**
  shared refresh and retries the request once. The three races are handled
  explicitly - concurrent 401s (single flight), a 401 that arrives after a refresh
  finished (a generation number), and a refresh whose trigger is cancelled
  (`refCount: false`) - and each is a test (ADR-0017).
- A failed refresh ends the session once, however many requests failed;
  `provideSessionExpiryRedirect` sends the user to
  `/login?returnUrl=<page>&reason=expired`, the login page explains why, and signing in
  returns them there. `returnUrl` is followed only when it is a path inside the app
  (`return-url.ts`) - the open redirect it prevents is tested.
- Route protection: `authGuard` now restores the session and redirects with the
  intended destination. `requirePermission(p)` guards the customer section (READ),
  `/customers/new` (CREATE) and `/customers/:id/edit` (UPDATE); a denied route renders
  a new `/forbidden` page with the refused URL kept in the address bar.
- UI authorization with `*appIfPermitted`: create, edit, delete and the three bulk
  actions appear only for a role that may use them; a viewer gets no row selection.
  Action authorization in `CustomerStore`: a write the user may not perform fails
  locally as an `authorization` error, with no request (ADR-0018).
- Header shows the signed-in user and role, and a sign-out button.
- The interceptor chain is now five single-purpose interceptors - correlation id,
  request logging (new), auth refresh (new), CSRF, error mapping - with the order and
  the reason for it in `http.providers.ts`.
- File validation: one policy in `@ecm/contracts` (`checkFile`, `AVATAR_FILE_POLICY`,
  `IMPORT_FILE_POLICY`: extension, MIME type, size) run by both sides; the mock API
  additionally checks the avatar's first bytes against its declared type (ADR-0019).
- Mock API hardening: CSV export neutralises spreadsheet formulas; `/auth/session`
  reports the real expiry; logout also kills the refresh token when the access cookie
  is already gone; an oversized upload is 413 instead of 500.
- ESLint bans `bypassSecurityTrust*`, `innerHTML`/`outerHTML` assignment and
  `insertAdjacentHTML` - verified by writing each violation and watching lint reject it.
- `docs/security.md`: per-control ownership (frontend / backend / browser / reverse
  proxy), authentication architecture, token lifecycle, authorization model,
  interceptor responsibilities, CSRF, CORS, XSS, file upload, and what is not done.

**Architectural decisions**

- [ADR-0016](decisions/0016-session-tokens-in-httponly-cookies.md) - tokens live in
  `HttpOnly` cookies; the application never holds one. Supersedes ADR-0012. Answers
  open question 8: `/login` stays prerendered.
- [ADR-0017](decisions/0017-refresh-single-flight-and-interceptor-chain.md) - reactive
  refresh, single flight, generation check, one retry; one job per interceptor.
- [ADR-0018](decisions/0018-client-authorization-layers.md) - route, UI and action
  authorization by permission read from the server; hidden, not disabled.
- [ADR-0019](decisions/0019-file-upload-validation.md) - one file policy for both
  sides, and a byte-signature check only the server makes.

**Deviated from the plan**

- **Error mapping stopped logging.** A Phase 0 interceptor changed rather than
  extended: mapping _and_ logging in one place would have logged every 401 the refresh
  interceptor silently recovers from as an error. Logging moved to the new
  `requestLoggingInterceptor`, which also stopped logging query strings - search terms
  are names and email addresses.
- **The mock API changed in four places**, each a defect a Phase 3 test found:
  `/session` invented its expiry; logout after a long idle left the refresh token
  alive; multer's size error became a 500; the CSV export emitted live formulas. The
  Phase 0.5 behaviour was wrong, not merely incomplete.
- **`skipLocationChange` was replaced by `browserUrl`** for the forbidden page. The
  first implementation used it and a test showed that on an in-app navigation it
  leaves the _previous_ URL in the address bar.
- **`/login` stays prerendered** (open question 8). Debt row 13 moves to Phase 5.
- **`checkFile` has no client caller yet.** The prompt required file validation now;
  the upload screens are Phase 4. The shared rule is used by the server today and is
  tested in the contracts package. Debt row 19.
- `app-customer-table` gained a `selectable` input, so the page can drop the selection
  column for a role with no bulk action.
- No proactive (timer-based) refresh. Reactive refresh is needed anyway after a sleep
  or a reload, and one mechanism is easier to prove correct; ADR-0017.

**Deliberately not done**

- No upload, import or export **UI** - Phase 4. The API, the contract and the shared
  validation rule are ready.
- No Content-Security-Policy on the application document. It belongs to the server
  that serves `index.html` and needs nonces for Angular's inline styles and the event
  replay script - Phase 7, debt row 17.
- No cross-tab session sync (`BroadcastChannel`) - Phase 5, debt row 18.
- No password verification in the mock, by design (ADR-0007). Nothing in the client
  pretends otherwise.

**Checks**

| Check                  | Result                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | clean                                                                                                           |
| `npm run lint`         | clean - root + workspaces, 0 errors, 0 warnings                                                                 |
| `npm run typecheck`    | clean across all three packages, templates included                                                             |
| `npm test`             | 447 passed - 303 web, 111 mock-api, 33 contracts (was 376)                                                      |
| `npm run build`        | succeeded, browser + server bundles, 1 route prerendered                                                        |
| `npm run e2e`          | 45 passed (was 38), including login → protected route → permission-based UI → logout, expiry and failed refresh |
| Import cycles          | none - see note below                                                                                           |

The bundle-budget warning is still there: 801.8 kB against 500 kB, of which Phase 3
added about 5 kB (the session layer is in the initial chunk because the guard needs
it). Debt row 8, unchanged.

Import cycles were checked with a script that builds the relative-import graph and
runs Tarjan's algorithm: `apps/web/src` 141 modules / 357 edges with specs (126 / 282
at `phase-2`), `packages/contracts/src` 12 / 20, `apps/mock-api/src` 23 / 56 - no
strongly connected component anywhere. Phase 2's "158 modules, 352 edges" came from a
method that was not recorded, so compare these figures only with each other. One cycle
was avoided by design: `SKIP_SESSION_REFRESH` lives in its own file because the refresh
interceptor → `SessionService` → `SessionApi` chain would otherwise close on itself.

The refresh-race tests were checked for teeth: removing the single flight fails two of
them, removing the generation check fails two others.

**Findings worth carrying forward**

- **`skipLocationChange` does not keep "the URL the user asked for".** It keeps the URL
  that was _already_ in the address bar. For an in-app navigation that is the previous
  page. `RedirectCommand`'s `browserUrl` is the option that shows one route while the
  address bar says another - and in a unit test `router.url` is the rendered route
  while `Location.path()` is the address bar.
- **Angular starts a navigation's guards together** and honours the parent's result
  first. A child guard cannot assume the parent already established the session - so
  `requirePermission` also waits on `restore()`, and single flight keeps that to one
  request.
- **A refresh must outlive its trigger.** With rotation, the server spends the refresh
  token the moment the request arrives; if the response is abandoned because the
  component that caused it was destroyed, the browser keeps a spent token. Hence
  `shareReplay({ refCount: false })`.
- **Multer reports its limits as its own error type**, which a generic error handler
  turns into a 500. Any library that fails with a non-`ApiError` needs translating at
  the route that uses it.
- **A logout endpoint cannot see a path-scoped refresh cookie.** Scoping the refresh
  cookie to `/api/auth/refresh` is right, and it means logout has to find the session
  some other way once the access cookie is gone - here, by the CSRF token.
- **In the cloud session** that did this phase, Node 24.21.0 was installed from the
  nodejs.org tarball and Playwright's Chromium download (v1243) was blocked by the
  network policy, so the preinstalled v1194 build was used through a symlinked
  `PLAYWRIGHT_BROWSERS_PATH`. Machine state, not repository state - like the Windows
  notes above.

**For the next phase (4)**

- `checkFile` with `AVATAR_FILE_POLICY` / `IMPORT_FILE_POLICY` is the client-side check
  the upload and import screens should call before sending - and nothing more. The
  server repeats it and adds the byte check.
- Import and export buttons need `*appIfPermitted="'CUSTOMER_IMPORT'"` /
  `'CUSTOMER_EXPORT'`, and their store methods a `refuseUnless(...)`, the way the
  existing writes have them. The server already refuses them for a viewer.
- A session that expires while a form holds unsaved changes triggers the
  unsaved-changes dialog on the way to `/login`; staying leaves a form that cannot save
  until the user signs in elsewhere. Debt row 20 - a UX decision for Phase 4.
- Realtime (SSE) will need its own answer to an expired session: an `EventSource`
  does not go through `HttpClient`, so the refresh interceptor never sees its 401.

---

### Phase 2 - Customer CRUD, Forms & Server State

**Completed:** 2026-09-20 - **Tag:** `phase-2-complete`

**Built**

- The customer list: server-side paging, sorting, keyword search, status, gender and
  created-date filters, reset, refresh, page size, selection and bulk actions - with
  **all eight list parameters in the URL**, normalised once by `readCriteria` and
  validated against the contract's own schemas, so a hand-edited `?status=DELETED`
  renders the unfiltered list rather than a 422.
- `CustomerStore`: one signal store for the feature, provided by the feature's route,
  over an explicit cache keyed by the normalised query (ADR-0013). Requests run
  through `switchMap`, so a superseded one is cancelled rather than raced.
- `RemoteData<T>` - `idle | loading | refreshing | success | error` - with "empty"
  derived rather than stored. `refreshing` carries the value for that same request,
  which is what keeps a revisited page on screen instead of flickering.
- `CustomerApi`: every call validated against `@ecm/contracts`, with a timeout and
  retry policy chosen per endpoint - reads retried on network failures, writes never.
- Create and edit as one page told which it is by route metadata: typed reactive
  forms, required/format/length validation, two cross-field rules, an asynchronous
  email-uniqueness check, server field errors merged onto the right controls, dirty
  state, reset, and a `CanDeactivate` guard for unsaved changes.
- Delete with a real confirmation, and bulk activate/deactivate/delete that report
  **per item** - failures grouped by reason and left selected so they can be retried.
- The audit trail, reading the trail endpoint and rendering actions as sentences
  rather than enum members.
- The 409 path, both of them: a stale write offers to reload and keeps the user's
  typing (ADR-0015); a duplicate email on create is marked on the email field.
- A placeholder sign-in and a CSRF interceptor - the minimum needed to reach an API
  that is behind authentication, with the line to Phase 3 stated in ADR-0012.
- `auditListResponseSchema` in the contracts package, so the audit envelope has one
  definition instead of living only in the mock API.

**Architectural decisions**

- [ADR-0012](decisions/0012-phase-2-session-boundary.md) - what Phase 2 borrowed from
  Phase 3 to be able to make a request at all, and what it deliberately did not.
- [ADR-0013](decisions/0013-customer-server-state.md) - one feature store, an explicit
  cache, cancellation by switching, and the invalidation rules.
- [ADR-0014](decisions/0014-no-dto-to-domain-mapping.md) - the contract type is the
  domain type. Answers open question 6.
- [ADR-0015](decisions/0015-losing-write-keeps-both-edits.md) - a losing write reloads
  and resubmits only this user's fields.

**Deviated from the plan**

- **Phase 2 touched authentication.** It had to: every customer endpoint is behind
  `requireAuth`. Three things were added - `SessionApi`, `SessionService.signIn()` and
  `csrfInterceptor` - and nothing else. ADR-0012 is the record.
- **Two Phase 1 files were changed rather than only extended.** `app-select` had a
  real defect (below), and `core/time/instant.ts` gained `formatDateOnly`, which is
  the operation its own documentation already described but had not written.
- **`ConflictError` gained `currentVersion`.** The error taxonomy could not otherwise
  distinguish the two things 409 means on this API, and the form needs to.
- **`RemoteData` and `request-policy` live in the customer feature**, not in `core/`.
  They are generic, and there is exactly one caller; moving them when a second
  appears is a rename, which is the cheap direction.
- The i18n lint rule's `ignoreAttributes` grew from 8 entries to 16 (form wiring,
  `scope`, component inputs). The Phase 1 note said to watch this; it is now debt
  row 16.

**Deliberately not done**

- No authorization in the UI. The server enforces the role matrix; the client does
  not yet hide what it would refuse - Phase 3.
- No avatar upload, no CSV import, no notifications, no realtime - Phase 4. The API
  and the contracts for all of them already exist.
- No virtual scrolling and no `@defer`. Phase 5 measures first.
- No optimistic updates. Every mutation waits for the server, which is the honest
  default until Phase 4 decides the cache can survive them.

**Checks**

| Check                  | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `npm run format:check` | clean                                                    |
| `npm run lint`         | clean - root + workspaces, 0 errors, 0 warnings          |
| `npm run typecheck`    | clean across all three packages                          |
| `npm test`             | 376 passed - 248 web, 101 mock-api, 27 contracts         |
| `npm run build`        | succeeded, browser + server bundles, 1 route prerendered |
| `npm run e2e`          | 38 passed, including the full CRUD journey and axe       |
| Import cycles          | none - 158 modules, 352 edges                            |

The bundle-budget warning is still there and still pre-existing: 797 kB against a
500 kB budget, of which Phase 2 added 15 kB - every page of the feature is a lazy
chunk. Debt row 8, unchanged.

**Findings worth carrying forward**

- **`app-select` had a real defect, and only a real caller could find it.** It bound
  `[value]` on the `<select>`; Angular applies an element's own bindings before it
  creates that element's children, so a value that arrived before the first render -
  from a bookmarked URL or a loaded record - named an option that did not exist yet
  and was silently dropped. The field rendered empty while the filter was active.
  Fixed by binding `[selected]` on each option, which is order-independent, and
  covered by a regression test in `select.spec.ts`.
- **An async validator resolving does not emit on `statusChanges`.** Angular 22
  publishes a `StatusChangeEvent` on `control.events` instead. A submit that waited
  on `statusChanges` for the form to stop being `PENDING` waited for ever, leaving
  the button stuck in its busy state. `events` is the stream to use.
- **A prerendered form is submittable before it is alive.** Pressing submit in that
  window performs the browser's default GET - which put the username and password in
  the address bar. The submit button is now disabled until `afterNextRender` runs.
  Typing before hydration is still discarded: debt row 13.
- **`CanDeactivateFn` receives `null` at runtime**, whatever its type says, for a
  route that resolved but never rendered. A guard that calls a method on it turns
  every navigation away from that route into an unhandled error.
- **A PATCH has two reference points, not one.** The diff must be measured against
  the record the form was _filled from_, while the version comes from the _newest_
  record. Confusing them silently reverts whatever a colleague just changed - the
  exact failure optimistic concurrency exists to prevent. The E2E test caught it
  because it asserts on the other person's field, not on the save succeeding.
- **jsdom does not implement form submission from a button** (`requestSubmit`), so a
  component test has to dispatch the submit event itself. The button works in a real
  browser, which is where the E2E suite checks it.
- **Playwright's `request` fixture has its own cookie jar.** Signing the browser in
  and then calling it produces a 401 that reads like an application bug;
  `context.request` is the one that shares.

**For the next phase (3)**

- `authGuard` still returns `true` and is already attached to the shell branch.
  `SessionService` has `signIn` and the signals; refresh, expiry, logout and the
  guard body are what is missing.
- `csrfInterceptor` is finished work Phase 3 can keep. The interceptor order is
  documented in `http.providers.ts` and is load-bearing.
- The list, the detail page and the form all handle an `authentication` error today
  by offering a link to sign in. Phase 3 turns that into a redirect that preserves
  the intended destination, and the pages should get simpler, not more complex.
- The role matrix is already enforced server-side and already shared through
  `@ecm/contracts`. Nothing in the UI reads it yet, which is Phase 3's UI
  authorization work - and the delete action on the detail page is the obvious first
  place for it, because MANAGER is deliberately denied it.
- The sign-in page is a placeholder by design, and ADR-0012 says what it must grow
  into. Phase 3 should supersede that ADR rather than extend it.

---

### Phase 1 - Routing, Layout & Design System

**Completed:** 2026-09-20 - **Tag:** `phase-1-complete`

**Built**

- The route tree: `/customers` with `new`, `:id`, `:id/edit`, `:id/audit`, a
  `/technical-labs` area behind a `CanMatch` feature flag, and a wildcard that renders
  _inside_ the shell so a mistyped URL still has navigation. Every route lazy, every
  feature owning its own route file.
- `AppShell` - header, navigation, breadcrumbs, one `<main>` landmark, skip link - with
  three genuinely different layouts: a permanent sidebar, an icon rail, and a modal
  drawer with a focus trap (ADR-0011).
- Thirteen shared UI primitives on top of CDK, each accessible on its own:
  button/link, text input and select as `ControlValueAccessor`s, badge, spinner,
  skeleton, empty and error states, dialog, dropdown menu, tooltip, pagination, and a
  table scroll region.
- A two-layer design-token system and runtime light/dark theming driven by one
  attribute on `<html>` (ADR-0010).
- Translated route titles and a document `lang` that follows the active locale
  (ADR-0009), which answers open question 4.
- Typed route metadata (`withMetadata` / `routeMetadata`) and breadcrumbs derived from
  the router's state rather than pushed by pages.
- Attribute checking turned on in the i18n lint rule, which pays technical-debt row 4.

**Architectural decisions**

- [ADR-0009](decisions/0009-translated-route-titles.md) - route titles are translation
  keys, resolved by a `TitleStrategy`.
- [ADR-0010](decisions/0010-design-tokens-and-theming.md) - primitive and semantic
  token layers; the theme is one attribute.
- [ADR-0011](decisions/0011-adaptive-shell-layout.md) - three layouts; CSS for
  presentation, TypeScript only for the drawer's behaviour.

**Deviated from the plan**

- `HomePage` was **deleted**, not filled in. Its API-connectivity check moved to
  `/technical-labs/api-connectivity`, which is what the lab area is for: a technique
  with no home in customer management. `/home` remains as a redirect, because a URL
  that once worked and now 404s is indistinguishable from a broken application.
- `app-button` renders an `<a>` when given a `link`. The shared-UI rules said "no
  navigation"; they now say "no component _decides_ where to navigate", because the
  alternative was either a click handler where a link belongs - losing middle click
  and "open in a new tab" - or a second component with the same styling. The rule and
  the reason are both written down in `shared/ui/README.md`.
- `src/styles/` and `stylePreprocessorOptions.includePaths` were added so component
  styles can `@use` the shared breakpoint partial. Without it the breakpoint values
  would be copied into every component that has a media query.
- `tsconfig.spec.json` gained the `node` types, for one test that reads
  `_breakpoints.scss` to prove the SCSS and TypeScript breakpoints still agree.
- The customer list page fabricates a page count so the paginator can demonstrate that
  list state lives in the URL. It is named `PLACEHOLDER_TOTAL_PAGES` and is debt row 11.
- **Five shared components have no caller yet**: `app-text-input`, `app-select`,
  `app-table`, `app-skeleton` and `app-error-state`. The shared-UI rule is that a
  component moves there when a _second_ caller needs it, and these have none. They were
  built anyway because the phase prompt names them and because their caller is named and
  one phase away - the list needs the table, the skeleton and the error state; the form
  needs the two inputs. That is the reason rule 8 actually asks for. If Phase 2 ends
  without using one of them, it should be deleted rather than kept for a third phase.

**Deliberately not done**

- No data anywhere. No API clients, no stores, no forms - Phase 2. The customer pages
  are routes and layout, and say so on screen.
- No real authentication. `authGuard` still returns `true`; it is wired onto the shell
  branch so Phase 3 changes a function body.
- No second language. The i18n seam is exercised by the title strategy's language
  test; Phase 6 adds Vietnamese.
- No stylelint, no visual regression, no dependency-boundary tooling - Phase 6/7.

**Checks**

| Check                  | Result                                                   |
| ---------------------- | -------------------------------------------------------- |
| `npm run format:check` | clean                                                    |
| `npm run lint`         | clean - root + workspaces, 0 errors, 0 warnings          |
| `npm run typecheck`    | clean across all three packages                          |
| `npm test`             | 247 passed - 123 web, 101 mock-api, 23 contracts         |
| `npm run build`        | succeeded, browser + server bundles, 1 route prerendered |
| `npm run e2e`          | 30 passed, including axe in both themes                  |
| Import cycles          | none - 125 modules, 202 edges                            |

`npm run build` prints a bundle-budget warning. It is not new: the same warning exists
at `phase-0.5-complete` (739 kB against a 500 kB budget), and Phase 1 added 42 kB of
it. Recorded as debt row 8 rather than silenced by raising the budget.

**Findings worth carrying forward**

- **A backtick inside a template literal ends it.** Several component templates carried
  explanatory comments written in the same Markdown style as the rest of the repository,
  and the compiler reported only `Failed to resolve @Component.styles to a string`,
  naming no file. Prose inside a `template:` or `styles:` block cannot use backticks.
- **jsdom makes CDK's focus utilities untestable.** `InteractivityChecker` decides an
  element is focusable by measuring it, and jsdom gives everything zero size - so a
  focus trap finds nothing to focus and the test fails for a reason that has nothing to
  do with the component. Focus behaviour belongs in the E2E suite.
- **CDK reads `keyCode` as well as `key`**, and jsdom's `KeyboardEvent` constructor
  ignores `keyCode` in its init object. An Escape key event has to have it defined
  afterwards, or CDK silently ignores it.
- **The i18n lint rule checks every static attribute**, not only the ones a user can
  read, so `data-testid` and component inputs have to be excused by name. The list in
  `eslint.config.js` is short and grouped; if it grows past a screen, the rule is the
  wrong tool and a custom one is cheaper than the exceptions.
- **Playwright matches accessible names by substring.** "Navigation menu" also matched
  "Dismiss the navigation menu" - which is worth knowing because the same ambiguity is
  real for screen-reader users, and the fix was to give the two controls different
  names, not only to add `exact: true`.

**For the next phase (2)**

- `CustomerListPage`, `CustomerDetailPage`, `CustomerFormPage` and `CustomerAuditPage`
  exist as routes with layout and no data. Replacing their bodies is the expected shape
  of Phase 2; the routes, parameters and metadata should not need to move.
- List state is already in the URL and arrives as component inputs. The server-state
  layer should read those inputs rather than introduce a second source of truth.
- `app-table`, `app-pagination`, `app-empty-state`, `app-error-state`, `app-skeleton`
  and `app-dialog` were built for the list and the delete confirmation; `app-text-input`
  and `app-select` for the form. `error` on the text input is an already-translated
  message on purpose - merging client validators with the server's `fieldErrors` is
  Phase 2's decision, not the component's.
- `/customers/:id`'s breadcrumb reads "Customer". A resolver feeding a dynamic label is
  the intended way to make it read the customer's name; the breadcrumb component does
  not need to change.
- The delete confirmation on the detail page is wired and inert. Phase 2 replaces the
  disabled confirm button; nothing about the dialog changes.

---

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

| #   | Debt                                                                                                                                                                                             | Added in  | Why accepted                                                                                                                                                                                                              | Pay by                                      | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| 2   | Dependency direction is enforced by review, not by a tool                                                                                                                                        | Phase 0   | There is one package and few boundaries to break                                                                                                                                                                          | Phase 7                                     | Open   |
| 3   | Four npm packages have unapproved install scripts (`esbuild`, `lmdb`, `msgpackr-extract`, `@parcel/watcher`) under npm 11's new gating; builds work without them                                 | Phase 0   | No observed impact on build, test or serve                                                                                                                                                                                | Phase 7                                     | Open   |
| 5   | `packages/contracts` must be built before the apps typecheck; a bare `tsc` in `apps/web` fails on a fresh clone                                                                                  | Phase 0.5 | The root scripts handle it; only a hand-run command is affected                                                                                                                                                           | Phase 7 (CI)                                | Open   |
| 6   | The mock API rate limiter is fixed-window, so a client can send up to twice the limit across a boundary                                                                                          | Phase 0.5 | It exists to make 429 a real code path, not to be a real limiter                                                                                                                                                          | not planned - documented instead            | Open   |
| 8   | The browser's initial bundle is 797 kB raw against a 500 kB budget                                                                                                                               | Phase 0.5 | Pre-existing and measured; Phase 2 added 15 kB of it, because every feature page is lazy                                                                                                                                  | Phase 5                                     | Open   |
| 9   | `app-dialog` renders inline rather than in a CDK overlay, and does not lock background scrolling                                                                                                 | Phase 1   | No page yet has a transformed ancestor or a scroll to lock                                                                                                                                                                | Phase 4                                     | Open   |
| 10  | "Components use only semantic tokens" is enforced by review and a grep, not by a linter                                                                                                          | Phase 1   | The grep for hex literals and `--palette-*` in components is clean today                                                                                                                                                  | Phase 6 (stylelint)                         | Open   |
| 12  | A `VALIDATION_FAILED` response names the field but not the reason in any machine-readable form                                                                                                   | Phase 2   | The envelope's messages are developer prose and cannot be translated, so the client says which field and supplies its own sentence                                                                                        | Phase 6 (contract change)                   | Open   |
| 13  | Typing into the prerendered sign-in form before hydration is discarded                                                                                                                           | Phase 2   | The submit button is disabled until the app is live, so the credential cannot reach the URL; only the keystrokes are lost. Phase 3 kept `/login` prerendered: every redirect to it is a client-side navigation (ADR-0016) | Phase 5                                     | Open   |
| 14  | Search does not match across diacritics - "nguyen" does not find "Nguyễn"                                                                                                                        | Phase 2   | The mock's index is a plain lowercase substring match, which is honest about what a naive search does                                                                                                                     | Phase 6                                     | Open   |
| 15  | A mutation refetches the list even when nobody is looking at it                                                                                                                                  | Phase 2   | One request, in exchange for the list being correct on arrival; a staleness flag is more machinery than that is worth                                                                                                     | Phase 4 (with realtime)                     | Open   |
| 16  | The i18n lint rule's `ignoreAttributes` list has grown to 16 entries                                                                                                                             | Phase 2   | Every entry is genuinely not copy, and the rule still catches real violations                                                                                                                                             | Phase 6 (a custom rule is cheaper past ~20) | Open   |
| 17  | No Content-Security-Policy on the application document                                                                                                                                           | Phase 3   | It belongs to the server that serves `index.html`, and needs nonces for Angular's inline styles and event-replay script                                                                                                   | Phase 7                                     | Open   |
| 18  | Tabs learn of a sign-out elsewhere only on their next request, and two tabs refreshing at the same instant can have one refused (rotation)                                                       | Phase 3   | The refused tab asks the user to sign in, which is safe; cross-tab messaging is a browser-API concern                                                                                                                     | Phase 5                                     | Open   |
| 19  | `checkFile` has no client caller yet                                                                                                                                                             | Phase 3   | Required by the Phase 3 prompt; the server uses it today and the upload screens that will call it are Phase 4                                                                                                             | Phase 4 (use it, or delete it)              | Open   |
| 20  | A session that ends - by expiry or by pressing sign out - while a form has unsaved changes asks whether to discard them on the way to sign-in; staying leaves a signed-out form that cannot save | Phase 3   | Nothing is lost silently, which is the property that matters; the better flow (re-authenticate in place) is a UX design question                                                                                          | Phase 4                                     | Open   |
| 21  | A signed-out cold visit sends one refresh request that fails with 403 (no CSRF cookie) before settling on "anonymous"                                                                            | Phase 3   | One wasted request, handled correctly; skipping it would mean the client reasoning about cookies it is meant not to depend on                                                                                             | Phase 7                                     | Open   |

---

## Open questions

Things that could not be decided yet and must be decided by a specific phase.

| #   | Question                                                                                            | Must be answered by | Notes                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~Do Angular 22's `resource()` / `httpResource()` APIs cover the server-state needs?~~              | ~~Phase 0~~         | **Answered 2026-09-20:** `resource()` is `@experimental` in 22.1.7. Phase 2 writes the server-state layer explicitly.                                                                  |
| 2   | Does the hand-written cache survive realtime + optimistic updates, or is NgRx SignalStore needed?   | Phase 4             | Revisit once, via ADR. See context §5.5                                                                                                                                                |
| 3   | ~~Is SSR-in-dev noisy enough to hurt early phases?~~                                                | ~~Phase 1~~         | **Answered 2026-09-20:** no. Dev server, build and E2E all run normally with SSR enabled.                                                                                              |
| 4   | ~~Should route titles use a translating `TitleStrategy`, or per-page metadata?~~                    | ~~Phase 1~~         | **Answered 2026-09-20:** a `TitleStrategy` reading route `title` as a translation key. See [ADR-0009](decisions/0009-translated-route-titles.md)                                       |
| 5   | Does the client hold one SSE connection per tab, or elect one tab to hold it and share?             | Phase 4 / 5         | HTTP/1.1 allows six connections per origin; see ADR-0006                                                                                                                               |
| 6   | ~~Where does DTO-to-domain mapping live once the customer feature exists?~~                         | ~~Phase 2~~         | **Answered 2026-09-20:** nowhere - the contract type is the domain type. See [ADR-0014](decisions/0014-no-dto-to-domain-mapping.md)                                                    |
| 7   | Does the dialog need a CDK overlay and a scroll lock once confirmations stack?                      | Phase 4             | See debt row 9; inline rendering is fine until an ancestor is transformed                                                                                                              |
| 8   | ~~Should `/login` stop being prerendered, now that a prerendered form loses pre-hydration typing?~~ | ~~Phase 3~~         | **Answered 2026-09-25:** no. Every redirect to it is client-side, so only a cold load shows the prerendered form. See [ADR-0016](decisions/0016-session-tokens-in-httponly-cookies.md) |
| 9   | Does "drop every cached page on every write" survive a server that pushes changes?                  | Phase 4             | ADR-0013 says it is right today; realtime is what will test it                                                                                                                         |
