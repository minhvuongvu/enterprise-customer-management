# Architecture

What exists after Phase 1, and the rules that later phases build inside.

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
│       ├── customers/                 the business feature (pages only, until Phase 2)
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
| HTTP            | `core/http/`                       | correlation-id and error-mapping interceptors, ordered                             | Phase 2–4   |
| Auth            | `core/auth/`                       | `SessionService` signals, `authGuard` that returns `true` and says so              | Phase 3     |
| Config          | `core/config/`                     | build-time `BuildEnvironment` + runtime `AppConfigStore` + feature flags           | Phase 7     |
| Time            | `core/time/instant.ts`             | branded `Instant` (UTC) and `DateOnly` types                                       | Phase 6     |

Phase 1 added two more that behave like seams, and are listed here for the same
reason - they are small now and expensive to retrofit:

| Seam           | Where           | Today                                                        | Filled in |
| -------------- | --------------- | ------------------------------------------------------------ | --------- |
| Route metadata | `core/routing/` | typed `withMetadata()` / `routeMetadata()`; breadcrumb keys  | Phase 3   |
| Document head  | `core/seo/`     | translated `TitleStrategy`; `<html lang>` follows the locale | Phase 6/7 |

---

## 4. State ownership

Phase 0 introduces no feature state. The rules it fixes:

| Kind             | Owner                  | Mechanism                                                    |
| ---------------- | ---------------------- | ------------------------------------------------------------ |
| Local UI state   | the component          | `signal()` in the component                                  |
| Form state       | the form               | Reactive Forms (Phase 2)                                     |
| Navigation state | the URL                | route and query parameters, read via component input binding |
| Server state     | the feature's store    | a signal store per feature plus an explicit cache (Phase 2)  |
| Shared app state | `core/`                | `AppConfigStore`, `SessionService`                           |
| Derived state    | wherever the source is | `computed()`                                                 |

Two rules follow from §4.5: the URL is the source of truth for anything that must
survive a reload or be shareable as a link, and nothing goes into shared application
state merely because more than one component reads it.

No store library is installed. That decision is revisited once, at Phase 4 — see
ANGULAR_PROJECT_CONTEXT.md §5.5.

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
every Phase 2 client follows:

1. Takes its base URL from runtime configuration, so one build runs anywhere.
2. **Validates the response against the contract** before returning it. A 200 with the
   wrong shape becomes a `server` error at the boundary, instead of `undefined is not an
object` three layers away.
3. Lets failures leave as `AppError`. Nothing above the HTTP layer sees an
   `HttpErrorResponse`.

Dependency direction across packages is strict and one-way:

```text
apps/web  →  packages/contracts  ←  apps/mock-api
```

`packages/contracts` imports from neither. The whole value of a shared definition is
that both sides depend on it and it depends on nothing of theirs.

---

## 5. HTTP and errors

A request passes through, in order:

1. `correlationIdInterceptor` — generates an ID, sets the `X-Correlation-Id` header,
   and publishes the ID on the request context.
2. `errorMappingInterceptor` — catches the failure, reads that context, maps to an
   `AppError`, logs it, rethrows the mapped value.

The order is not incidental: the mapper reads the context the first interceptor sets.
`provideAppHttp()` is the only place the list exists.

The mapper **validates** the error body against the published envelope rather than
trusting it: a 422 whose body is a proxy's HTML error page is a real possibility, and
reading `details.fieldErrors` off it would throw inside the error handler - turning a
handled failure into an unhandled one.

Below that interceptor, nothing ever sees an `HttpErrorResponse`. Features handle
`AppError` kinds — `conflict`, `network`, `authorization` — not status codes. Every
`AppError` carries a `messageKey`, never a sentence, which is how §4.7's "no raw
backend errors" and the no-hardcoded-strings rule end up being the same rule.

Timeout, retry and cancellation are deliberately **not** interceptors. They are
per-endpoint decisions and belong to the data-access layer in Phase 2; an interceptor
that retries everything will retry the request you least want retried.

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
│   ├── ''                    list        ?page &size &search
│   ├── /new                  form        data.mode = 'create'
│   └── /:id                  detail
│       ├── /edit             form        data.mode = 'edit'
│       └── /audit            audit trail
├── /technical-labs           lazy, canMatch: technicalLabsEnabled
│   ├── ''                    index, rendered from lab-catalog.ts
│   ├── /api-connectivity     a real lab
│   └── /:labId               placeholder for a planned lab
└── **                        not found, inside the shell
```

Five decisions are encoded in that shape.

**Public and authenticated are different branches.** `/login` sits outside the
shell, and is the one route that is prerendered (ADR-0003). Everything else
lives under a path-less route that renders `AppShell` and carries `authGuard`,
so the guard is stated once rather than repeated on every page — and Phase 3
changes a function body, not the tree.

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
(`withComponentInputBinding`), so a page reads them like any other input.

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

`authGuard` (Phase 0, still returning `true`) sits on the shell branch.
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
