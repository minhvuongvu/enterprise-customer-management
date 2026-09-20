# Architecture

What exists after Phase 0, and the rules that later phases build inside.

`ANGULAR_PROJECT_CONTEXT.md` is the authority on intent. This document describes the
code.

---

## 1. Overview

```text
enterprise-customer-management/        npm workspace root
├── apps/web/                          Angular 22 application (SSR-scaffolded, zoneless)
│   └── src/app/
│       ├── core/                      infrastructure, provided once
│       ├── shared/ui/                 domain-agnostic components (empty until Phase 1)
│       ├── login/  home/  not-found/  Phase 0 placeholder routes
│       ├── app.routes.ts              route tree
│       ├── app.routes.server.ts       render mode per route
│       └── app.config.ts              browser bootstrap
├── e2e/                               Playwright specs (app + API from Phase 0.5)
└── docs/                              this folder
```

`apps/mock-api` and `packages/contracts` arrive in Phase 0.5. The workspace is already
shaped for them.

---

## 2. Dependency direction

```text
            routes / pages
                  ↓
        feature state (Phase 2)
                  ↓
          data access (Phase 2)
                  ↓
              core/
```

Rules, in the order they get broken:

1. **`core/` never imports from a feature.** Infrastructure that knows what a customer
   is stops being infrastructure.
2. **A feature never reaches into another feature's internals.** Cross-feature
   communication goes through an explicit public entry point.
3. **`shared/ui` never imports from `core/` business concerns or from any feature.** It
   takes inputs and emits outputs.
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

## 5. HTTP and errors

A request passes through, in order:

1. `correlationIdInterceptor` — generates an ID, sets the `X-Correlation-Id` header,
   and publishes the ID on the request context.
2. `errorMappingInterceptor` — catches the failure, reads that context, maps to an
   `AppError`, logs it, rethrows the mapped value.

The order is not incidental: the mapper reads the context the first interceptor sets.
`provideAppHttp()` is the only place the list exists.

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

## 9. When to create a shared component

All of these, not some:

- a second feature actually needs it — not "will probably need it";
- it carries no business vocabulary;
- it has no data access, no navigation, no feature state;
- it is accessible on its own, without the caller adding ARIA to fix it.

Until all four hold, the component lives next to the feature that owns it. Moving it
later is a rename; un-sharing it is not.

## 10. When _not_ to create an abstraction

- You cannot name the second caller.
- It exists to hide a library the codebase has already committed to.
- It is a wrapper whose methods pass straight through.
- Its only justification is that enterprise codebases tend to have one.

An explicit implementation that makes the concept visible beats a clever one that
hides it. This repository is read more often than it is run.
