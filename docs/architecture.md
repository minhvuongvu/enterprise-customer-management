# Architecture

What exists after Phase 2, and the rules that later phases build inside.

`ANGULAR_PROJECT_CONTEXT.md` is the authority on intent. This document describes the
code.

---

## 1. Overview

```text
enterprise-customer-management/        npm workspace root
├── apps/web/                          Angular 22 application (SSR-scaffolded, zoneless)
│   ├── src/styles/                    design tokens, element defaults, a11y utilities
│   └── src/app/
│       ├── core/                      infrastructure, provided once
│       ├── shared/ui/                 domain-agnostic components
│       ├── layout/                    the application shell and its parts
│       ├── customers/                 the business feature: data/, state/, four pages
│       ├── technical-labs/            isolated browser experiments
│       ├── login/  not-found/         the public page and the wildcard
│       ├── app.routes.ts              route tree
│       ├── app.routes.server.ts       render mode per route
│       └── app.config.ts              browser bootstrap
├── apps/mock-api/                     Express mock backend - a real server
├── packages/contracts/                Zod schemas + inferred types, shared by both
├── e2e/                               Playwright specs (app + API)
└── docs/                              this folder
```

`packages/contracts` is the single definition of the API shape. It is a compiled
library (ADR-0008); the two apps run from source.

---

## 2. Dependency direction

```text
   layout/  ->  routes / pages  ->  shared/ui/
                      |
                      v
            feature state (Phase 2)
                      |
                      v
             data access (Phase 2)
                      |
                      v
                    core/
```

`layout/` and `shared/ui/` are both presentation, and they are separate
folders because they answer to different owners: `layout/` knows this
application has customers and technical labs, `shared/ui/` must not know what a
customer is. `layout/` may use `shared/ui/`; never the other way round.

Rules, in the order they get broken:

1. **`core/` never imports from a feature.** Infrastructure that knows what a customer
   is stops being infrastructure.
2. **A feature never reaches into another feature's internals.** Cross-feature
   communication goes through an explicit public entry point.
3. **`shared/ui` never imports from `core/` business concerns or from any feature.** It
   takes inputs and emits outputs, and decides no navigation of its own - see the
   rules in `apps/web/src/app/shared/ui/README.md`.
4. **Nothing imports upward.** `core/logging` may not import `core/http`; the arrow
   only points one way.

Phase 7 adds an automated dependency check. Until then this is review discipline, and
the reason it is written down.

Within `core/`, the internal order is:

```text
platform  ←  logging  ←  errors  ←  http
   ↑            ↑
 config       i18n        auth        time
```

---

## 3. The seams

Seven concerns do not retrofit cheaply, so Phase 0 builds the seam and a later phase
fills it. A seam is small on purpose; growing one into its phase's implementation is
the failure mode to avoid.

| Seam            | Where                              | Today                                                                              | Filled in   |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| Platform safety | `core/platform/platform.tokens.ts` | `IS_BROWSER`, `WINDOW`, `LOCAL_STORAGE`, `SESSION_STORAGE`; globals banned by lint | Phase 5/6   |
| i18n            | `core/i18n/`                       | Transloco, English only, lazily imported chunks                                    | Phase 6     |
| Logging         | `core/logging/`                    | `Logger` abstraction, `ConsoleLogger`, credential redaction, correlation IDs       | Phase 7     |
| Errors          | `core/errors/`                     | the §4.7 taxonomy as a discriminated union, central HTTP mapping                   | every phase |
| HTTP            | `core/http/`                       | five single-purpose interceptors, ordered (§5, ADR-0017)                           | **Phase 3** |
| Auth            | `core/auth/`                       | session lifecycle, guards, permission directive (§5a, ADR-0016/0018)               | **Phase 3** |
| Config          | `core/config/`                     | build-time `BuildEnvironment` + runtime `AppConfigStore` + feature flags           | Phase 7     |
| Time            | `core/time/instant.ts`             | branded `Instant` (UTC) and `DateOnly` types                                       | Phase 6     |

Phase 1 added two more that behave like seams, and are listed here for the same
reason - they are small now and expensive to retrofit:

| Seam           | Where           | Today                                                        | Filled in |
| -------------- | --------------- | ------------------------------------------------------------ | --------- |
| Route metadata | `core/routing/` | typed `withMetadata()` / `routeMetadata()`; breadcrumb keys  | Phase 3   |
| Document head  | `core/seo/`     | translated `TitleStrategy`; `<html lang>` follows the locale | Phase 6/7 |

Phase 2 filled the **Auth** seam only as far as making a request possible
([ADR-0012](decisions/0012-phase-2-session-boundary.md)). Phase 3 filled the rest and
superseded that ADR with [ADR-0016](decisions/0016-session-tokens-in-httponly-cookies.md).
Everything security-related, and who owns each part of it, is in
[`security.md`](security.md).

---

## 4. State ownership

Six kinds of state, and for each one: who owns it, how long it lives, what the
source of truth is, and what resets it. The customer feature is the worked example;
§15 shows it in place.

| Kind             | Owner                         | Lifetime                    | Source of truth                    | Reset by                        |
| ---------------- | ----------------------------- | --------------------------- | ---------------------------------- | ------------------------------- |
| URL / navigation | the router                    | the browser history entry   | the address bar                    | navigating                      |
| Server state     | the feature's store + cache   | the feature's route subtree | the server                         | a mutation's invalidation rules |
| Form state       | the `FormGroup` in the page   | the page                    | the form                           | `reset()` to the loaded record  |
| Local UI state   | a `signal()` in the component | the component               | the component                      | whatever the component says     |
| Shared app state | `core/`                       | the application             | `AppConfigStore`, `SessionService` | a reload                        |
| Derived state    | wherever the source is        | its source                  | `computed()`                       | nothing - it is not stored      |

Two rules follow from §4.5 of the context document, and Phase 2 is where they stop
being theoretical:

- **the URL is the source of truth** for anything that must survive a reload or be
  shareable as a link. The customer list holds no page number, filter or sort of its
  own; it reads them from query parameters and navigates to change them.
- **nothing goes into shared application state merely because more than one
  component reads it.** Selection on the list is read by three components and is
  still a signal on the page, because it means nothing once that page is gone.

The distinction that matters most in practice is between **server state** and
**everything else**. Server state is a cached answer to a question the server owns;
it can be stale, it can fail, and it has to be invalidated. The other five cannot be
stale, because nobody else can change them.

No store library is installed. That decision is revisited once, at Phase 4 - see
ANGULAR_PROJECT_CONTEXT.md §5.5 and [ADR-0013](decisions/0013-customer-server-state.md).

`resource()` was checked in Phase 0 and is still marked `@experimental` in Angular
22.1.7, so Phase 2's server-state layer is written explicitly rather than built on it.

---

## 4a. Data access

```text
component  →  feature state  →  API client  →  HttpClient  →  mock API
                                     ↓
                            @ecm/contracts (schemas)
```

An API client does three things, and `core/api/health.api.ts` is the worked example
`customers/data/customer.api.ts` follows:

1. Takes its base URL from runtime configuration, so one build runs anywhere.
2. **Validates the response against the contract** before returning it. A 200 with the
   wrong shape becomes a `server` error at the boundary, instead of `undefined is not an
object` three layers away.
3. Lets failures leave as `AppError`. Nothing above the HTTP layer sees an
   `HttpErrorResponse`.

Phase 2 added a fourth thing, deliberately **not** as an interceptor: a **timeout
and retry policy chosen per endpoint**. A read is retried on a network failure or a
timeout, because the question has not changed; a write never is, because "the
connection dropped" and "the server handled it and the response was lost" are
indistinguishable from the client and a retried create is a duplicate customer.
Nothing in the 4xx family is retried at all - a 409 will conflict again, and
retrying it only delays the message the user needs. See
`customers/data/request-policy.ts`.

Cancellation is not in the client either. It is a property of the subscription, and
the store gets it by switching between requests - see §15.

Dependency direction across packages is strict and one-way:

```text
apps/web  →  packages/contracts  ←  apps/mock-api
```

`packages/contracts` imports from neither. The whole value of a shared definition is
that both sides depend on it and it depends on nothing of theirs.

---

## 5. HTTP and errors

A request passes through, in order - one responsibility each
([ADR-0017](decisions/0017-refresh-single-flight-and-interceptor-chain.md)):

1. `correlationIdInterceptor` — generates an ID, sets the `X-Correlation-Id` header,
   and publishes the ID on the request context.
2. `requestLoggingInterceptor` — times the request and logs how it ended, once:
   completed (debug), failed (error, with the `AppError` kind), cancelled (debug).
   Path only; never the query string, a body or a header.
3. `authRefreshInterceptor` — on an `authentication` failure, joins or starts the
   single refresh in `SessionService` and retries the request once.
4. `csrfInterceptor` — echoes the readable CSRF cookie in a header, on unsafe,
   same-origin requests only.
5. `errorMappingInterceptor` — maps an `HttpErrorResponse` to an `AppError` and
   rethrows it. It no longer logs; that is the logging interceptor's job.

Error mapping stays last, so everything above it reasons about kinds, not status
codes. Logging sits above the refresh, so a renewed-and-retried request is one log
line. `provideAppHttp()` is the only place the list exists.

### 5a. Session and authorization

`SessionService` holds the client's view of the session - status, user,
permissions, access-token expiry - and **no token**: the tokens are `HttpOnly`
cookies ([ADR-0016](decisions/0016-session-tokens-in-httponly-cookies.md)).
`restore()` and `refresh()` are single-flight. `ended$` emits once when a session
ends; `provideSessionExpiryRedirect()` turns an expiry into
`/login?returnUrl=…&reason=expired`.

Authorization is checked by permission, never by role, at three client levels -
`requirePermission()` on routes, `*appIfPermitted` on controls, `CustomerStore` on
actions - and at the one level that is security, the API
([ADR-0018](decisions/0018-client-authorization-layers.md)).

The mapper **validates** the error body against the published envelope rather than
trusting it: a 422 whose body is a proxy's HTML error page is a real possibility, and
reading `details.fieldErrors` off it would throw inside the error handler - turning a
handled failure into an unhandled one.

Below that interceptor, nothing ever sees an `HttpErrorResponse`. Features handle
`AppError` kinds — `conflict`, `network`, `authorization` — not status codes. Every
`AppError` carries a `messageKey`, never a sentence, which is how §4.7's "no raw
backend errors" and the no-hardcoded-strings rule end up being the same rule.

Timeout, retry and cancellation are deliberately **not** interceptors. They are
per-endpoint decisions and live in the data-access layer - `customers/data/request-policy.ts`

- because an interceptor that retries everything will retry the request you least
  want retried, and one that times out everything will cut off a file upload.

---

## 6. Rendering

Decided in ADR-0003. `/login` is prerendered; everything else is client-rendered with
hydration and event replay.

The reason SSR exists in Phase 0 is enforcement. Because `npm run build` produces a
server bundle and must succeed, a browser global that slips into application code
fails the build the day it is written.

---

## 7. Configuration

Two mechanisms, deliberately distinct (ADR-0005):

|                         | Build-time                              | Runtime                                 |
| ----------------------- | --------------------------------------- | --------------------------------------- |
| Where                   | `src/environments/`                     | `public/config.json` → `AppConfigStore` |
| Changes                 | requires a rebuild                      | requires a redeploy of one file         |
| Use for                 | code that should not ship when disabled | values that differ per environment      |
| Available on the server | yes                                     | no — defaults are used                  |

Nothing secret goes in either. Both are served to the browser.

---

## 8. Naming conventions

Angular 22's 2025 file-naming style guide: `app.ts`, `session.service.ts`,
`login-page.ts`. No `.component.ts` suffix.

| Thing                  | Pattern                                           | Example                         |
| ---------------------- | ------------------------------------------------- | ------------------------------- |
| Routed component       | `<name>-page.ts`, class `NamePage`                | `login-page.ts`                 |
| Service                | `<name>.service.ts`                               | `session.service.ts`            |
| Functional interceptor | `<name>.interceptor.ts`, export `nameInterceptor` | `correlation-id.interceptor.ts` |
| Guard                  | `<name>.guard.ts`, export `nameGuard`             | `auth.guard.ts`                 |
| Provider bundle        | `<area>.providers.ts`, export `provideArea()`     | `http.providers.ts`             |
| Test                   | next to its subject, `<name>.spec.ts`             | `instant.spec.ts`               |

Selectors are prefixed `app-`, enforced by lint.

---

## 9. Routing

```text
/                             -> /customers
/login                        public, prerendered, its own <main>
/home                         -> /customers   (Phase 0's URL, kept working)

/                             AppShell + authGuard
├── /customers                lazy: customers.routes.ts
│   └── ''                    providers: CustomerCache, CustomerStore; requirePermission(READ)
│       ├── ''                list      ?page &size &sort &search &status &gender &createdFrom &createdTo
│       ├── /new              form      data.mode = 'create', requirePermission(CREATE), canDeactivate
│       └── /:id              detail
│           ├── /edit         form      data.mode = 'edit',   requirePermission(UPDATE), canDeactivate
│           └── /audit        audit trail
├── /technical-labs           lazy, canMatch: technicalLabsEnabled
│   ├── ''                    index, rendered from lab-catalog.ts
│   ├── /api-connectivity     a real lab
│   └── /:labId               placeholder for a planned lab
├── /forbidden                "not permitted", rendered by requirePermission with browserUrl
└── **                        not found, inside the shell
```

Five decisions are encoded in that shape.

**Public and authenticated are different branches.** `/login` sits outside the
shell, and is the one route that is prerendered (ADR-0003). Everything else
lives under a path-less route that renders `AppShell` and carries `authGuard`,
so the guard is stated once rather than repeated on every page. Phase 3 changed
its body, not the tree. What a signed-in user may _do_ is stated by each feature's
own routes with `requirePermission()`, because only the feature knows which of its
pages need which permission.

**Every route is lazy**, and a feature owns its own route file. The application
composes it with one `loadChildren` and learns nothing about its internals;
adding `/customers/:id/notes` is a change to `customers.routes.ts` alone.

**Not found renders inside the shell**, keeping the header and navigation. A
404 that strands the user is a support ticket. The URL is left as typed rather
than redirected, so a bug report still contains the address that failed.

**Order is load-bearing** in two places: `login` before the path-less shell, and
`new` before `:id` — otherwise "new" is read as an identifier.

**List state lives in the URL.** `/customers?page=3&search=nguyen` is a link a
colleague can be sent, a back button that works and a reload that lands where
the user was. Parameters arrive as component inputs
(`withComponentInputBinding`), so a page reads them like any other input. §15
describes how they are normalised.

**A path-less route carries the feature's providers.** It matches nothing and
renders nothing; its only job is to give `CustomerStore` and `CustomerCache` a
lifetime - alive for every page under `/customers`, destroyed on the way out.
That is what makes returning from a detail page instant and stops one user's
cached records outliving the section they were read in.

### Route metadata

| Field        | Meaning                                                                        |
| ------------ | ------------------------------------------------------------------------------ |
| `title`      | a **translation key**, resolved by `TranslatedTitleStrategy` (ADR-0009)        |
| `breadcrumb` | a translation key, read by `app-breadcrumbs`                                   |
| `mode`       | bound to the form page's `mode` input, so one component serves create and edit |

Metadata is authored through `withMetadata()` and read through
`routeMetadata()` — Angular types `Route.data` as `any`, so a typo in a route
file is otherwise silent.

`routeMetadata()` reads `routeConfig.data`, not `snapshot.data`. Angular merges
a parent's data into an empty-path child, so the other one would produce
"Customers › Customers".

### Guards

`authGuard` sits on the shell branch. It waits on `SessionService.restore()` - a
reload must not treat "not checked yet" as "signed out" - and sends anyone without a
session to `/login?returnUrl=<where they were going>`.

`requirePermission(permission)` is a guard factory used on feature routes. A denied
route renders `/forbidden` via `RedirectCommand` with `browserUrl`, so the address
bar keeps the refused URL. Both are UX; the API enforces the same rules
([`security.md`](security.md)).

`unsavedChangesGuard` is a **`CanDeactivate`** guard on the two routes that can
hold a half-typed record. It asks the component, because the component has the
form and the dialog; the guard itself is one line. Note that the router passes
`null` for a route that was resolved but never rendered, whatever the type says

- so the guard is null-safe, or every navigation away from a form that was not
  on screen becomes an unhandled error.

`technicalLabsEnabled` is a **`CanMatch`** guard on the lab area: a route that
does not match does not exist, so the request falls through to the wildcard and
the user sees an ordinary not-found page rather than a redirect that hints at a
hidden feature — and Angular never loads the chunk.

---

## 10. Layout

```text
AppShell                 header + navigation + <main>, one per authenticated page
├── AppHeader            brand, menu toggle, theme control
├── AppSidebar           the links; knows nothing about where it is rendered
├── Breadcrumbs          derived from the router's state
└── <main id="main-content" tabindex="-1">
    └── router-outlet
        └── PageContainer
            ├── PageHeader   <h1>, description, [pageActions] slot
            └── page content
```

The navigation changes **kind** across three widths — permanent region, icon
rail, modal drawer — rather than merely changing size. The full reasoning, the
breakpoints and the CSS/TypeScript split are in ADR-0011. The short version:
presentation is CSS, so it is correct before hydration and with JavaScript
disabled; only the drawer's behaviour (focus trap, Escape, close on navigation)
is code, because a media query cannot do those.

There is exactly **one `<main>` per page**. The shell owns it for the
authenticated area; `LoginPage` owns its own. The root component is an outlet
and nothing else, which is what keeps that true.

`PageContainer` answers "how wide is a page and how much air is between its
sections" once. `PageHeader` renders the page's only `<h1>` and projects its
actions, rather than accepting a list of button descriptors — a descriptor list
grows icons, tones, disabled reasons and permissions, and every one of those is
business knowledge inside a layout component.

---

## 11. Design tokens and theming

Two layers, and the separation is the point (ADR-0010):

```text
primitives   --palette-neutral-700, --palette-blue-600   a colour, no opinion
semantic     --surface-raised, --text-muted, --accent    what a thing means
```

**Components may reference only the semantic layer**, plus the shared scales
(`--space-*`, `--text-*`, `--radius-*`, `--motion-*`). A component that writes
a hex literal, or reaches for a palette entry, has opted out of theming without
saying so.

Only the semantic layer is redefined per theme, which is why switching is one
attribute on `<html>` and nothing re-renders. `ThemeService` writes
`data-theme` for an explicit choice and _removes_ it for "follow the system",
handing the decision back to the `prefers-color-scheme` rule that also paints
the first frame.

Contrast is part of the token definition rather than a later audit: several
tokens sit a step darker than the palette entry they are named after because
they failed 4.5:1, and the axe scans run in both themes.

Global CSS holds three things and nothing else: the tokens, element defaults
expressed in those tokens, and the two accessibility utilities that must work
across component style scopes (`.visually-hidden`, `.skip-link`). Everything
else is a component style. A rule added to the global sheet applies to every
page ever written, including the ones written after whoever added it has left.

---

## 12. Composition

- **Presentation components take inputs and emit outputs.** They own no data
  and decide no navigation.
- **Content projection over configuration** wherever the caller's content could
  be anything: the dialog's actions, the page header's actions, the empty
  state's call to action. An `[actions]` input would have to grow every
  property a button might need, and would end up carrying permissions.
- **State belongs to the caller.** `app-dialog` takes `[open]` and emits
  `(closed)`; it does not own its own visibility. The state that decides
  whether it should be open lives with the caller anyway.
- **Copy belongs to the caller**, already translated. The exception is text
  that belongs to the mechanism rather than to the message — "Go to page 4" —
  which lives under the `ui.*` namespace.
- **The platform does the platform's job.** A button is a `<button>`, a
  navigation is an `<a>`, a choice is a `<select>`. Replacing a native control
  is justified only when the design genuinely cannot be expressed with it.

The full set of rules, and the component inventory, is in
`apps/web/src/app/shared/ui/README.md`.

---

## 13. When to create a shared component

All of these, not some:

- a second feature actually needs it — not "will probably need it";
- it carries no business vocabulary;
- it has no data access, no navigation, no feature state;
- it is accessible on its own, without the caller adding ARIA to fix it.

Until all four hold, the component lives next to the feature that owns it. Moving it
later is a rename; un-sharing it is not.

## 14. When _not_ to create an abstraction

- You cannot name the second caller.
- It exists to hide a library the codebase has already committed to.
- It is a wrapper whose methods pass straight through.
- Its only justification is that enterprise codebases tend to have one.

An explicit implementation that makes the concept visible beats a clever one that
hides it. This repository is read more often than it is run.

## 15. The customer feature

The one business feature in the repository, and the shape every later feature
should follow.

### Layers

```text
page component        routing, layout, local UI state, form state
    |
CustomerStore         server state: what is on screen, and the cache
    |
CustomerApi           one request, validated, with a per-endpoint policy
    |
HttpClient            interceptors: correlation id, logging, refresh, CSRF, error mapping
    |
mock API
```

Four layers, and no more. There is no service between the page and the store, no
facade over the API client, and no repository interface with one implementation.

```text
customers/
  customers.routes.ts          the feature's routes; providers live here
  customer-vocabulary.ts       status and gender as keys and tones
  data/
    customer.api.ts            every HTTP call the feature makes
    customer-list-criteria.ts  the URL <-> query <-> cache-key shape
    customer-id.ts             a route parameter becomes a CustomerId, or null
    request-policy.ts          timeout and retry, per endpoint
  state/
    customer-store.ts          the feature's server state
    customer-cache.ts          pages by query key, entities by id
    remote-data.ts             idle | loading | refreshing | success | error
  customer-list/               page, filters, table, bulk bar
  customer-detail/             page
  customer-form/               page, fields, model, validators, guard
  customer-audit/              page
```

### URL state design

`/customers?page=2&size=20&search=john&status=ACTIVE&sort=updatedAt,desc`

Eight parameters arrive as component inputs and are normalised **once**, by
`readCriteria`, into a `CustomerListCriteria`. That single value is what the filter
controls render, what the cache is keyed by, and what the request is built from -
so "no status filter" cannot mean four different things in four places.

Three properties are load-bearing:

- **every value is validated.** A query string is user input: hand-edited,
  bookmarked, truncated by a chat client. `?status=DELETED` renders the unfiltered
  list rather than forwarding a 422.
- **defaults are omitted.** `/customers` stays `/customers`. A short URL is the one
  a person will actually paste, and it keeps the history readable.
- **a filter change returns to page 1.** Forgetting this is the classic list bug:
  searching from page 7 lands on page 7 of three pages of results, which reads as
  "no matches".

Selection is **not** in the URL. A link carrying twenty ids is not a link anyone
shares, and restoring a selection made against a different page of results is how
the wrong records get deleted. It is a signal on the page, cleared whenever the
criteria change.

### Server state and the cache

See [ADR-0013](decisions/0013-customer-server-state.md) for the reasoning. In short:
one store for the feature, provided by the feature's route, holding a cache of pages
keyed by `criteriaKey` and of entities by id. Requests go through `switchMap`, so a
superseded request is cancelled rather than raced. Debouncing lives in the filter
component, because that is where the keystrokes are.

Every mutation drops every cached page - a write can move a record onto a different
page - and updates or drops the entity it touched. The table is in the ADR and in
`customer-cache.ts`, next to the code that obeys it.

### UX states

Every API-driven surface renders one of four things, derived from the state machine
in one `computed` rather than a chain of `@if`s:

| Rendering | When                                  |
| --------- | ------------------------------------- |
| loading   | `idle` or `loading`                   |
| error     | `error` with no value to fall back on |
| empty     | a successful answer with no rows      |
| rows      | anything else                         |

`refreshing` deliberately does not get its own rendering: the rows stay on screen
under `aria-busy`, because they are still the answer to the question being asked.
An error that arrives while rows are on screen is a banner above them, not a blank
page.

### Form architecture

`customer-form-model.ts` holds the `FormGroup` factory, the validators and the two
conversions at its edges - none of it inside a component, so the rules can be tested
as rules. `customer-form.ts` renders the fields. `customer-form-page.ts` loads,
saves and navigates.

- **Synchronous validators** mirror the contract: required, format, length. The
  duplication is deliberate - a schema cannot tell a user which field to fix as they
  type, and the server validates everything again anyway.
- **Cross-field rules** live on the group that can answer them: an address is all or
  nothing, and an active customer needs a phone number.
- **One asynchronous validator**, on email, for the one rule the client genuinely
  cannot answer. It debounces inside itself, so Angular's own cancellation does the
  rest, and a failed check does not block the save - the server decides.
- **Server field errors** mark the named control. The envelope's messages are
  developer-facing prose, so the client uses the server's answer for _which field_
  and supplies its own translated sentence for _what to say_.
- **Unsaved changes** are protected by a `CanDeactivate` guard that asks the
  component, because the component has the form and the dialog. It covers navigation
  inside the application only; the tab-close case needs `beforeunload`, which is a
  browser API and belongs to Phase 5.

### Error handling

Nothing above the HTTP layer sees an `HttpErrorResponse`, and nothing renders a
server message. Each surface maps an `AppError` _kind_ to what the user should do:

| Kind             | What the page does                                               |
| ---------------- | ---------------------------------------------------------------- |
| `authentication` | offers a link to sign in - retrying would fail identically       |
| `not-found`      | says the customer does not exist, on detail and on edit          |
| `validation`     | marks the named fields on the form                               |
| `conflict`       | with a version, the reload panel; without one, a duplicate email |
| anything else    | a translated message and, where it can help, a retry             |

The conflict split is [ADR-0015](decisions/0015-losing-write-keeps-both-edits.md),
and it is the most important error path in the feature: a losing write reloads the
newest record, keeps what the user typed, and resubmits only their own fields.
