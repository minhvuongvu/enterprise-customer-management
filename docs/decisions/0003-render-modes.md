# ADR-0003 — Render modes: prerender the public surface, client-render the application

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0

## Problem

ANGULAR_PROJECT_CONTEXT.md §5.6 requires the application to be scaffolded with SSR in
Phase 0. It does not say what each route should actually do at request time, and the
default the CLI generates — prerender everything — is wrong for this application.

Customer Management is an authenticated back office. Its pages are per-user, and no
crawler will ever see them.

## Options considered

### A. Prerender everything (the CLI default)

Pros: fastest first paint; nothing to configure.
Cons: incoherent. Prerendering produces one HTML file at build time; a customer list
is different for every viewer and changes constantly. The prerendered output would be
a shell that is immediately discarded, or worse, stale data baked into a file.

### B. Server-render everything on demand

Pros: real SSR experience; fast first contentful paint on every route.
Cons: buys nothing here. SSR pays off for content that must be indexed or that must
appear before JavaScript loads for a first-time visitor. An authenticated back office
has neither requirement. It costs a rendering server, and it pushes session handling
into the render path — where a mistake leaks one user's data into another's HTML.

### C. Prerender the public surface, client-render the rest

Pros: each route gets the mode that matches what it is. Keeps the SSR toolchain, and
therefore the enforcement value, without pretending the authenticated app benefits.
Cons: two modes to understand instead of one.

### D. No SSR at all

Pros: simplest.
Cons: rejected by §5.6, and for a concrete reason: without a server build, a stray
`window` reference is not a build failure, and Phase 5's rendering lab becomes a
repository-wide refactor rather than a measurement.

## Decision

Option C, expressed in `app.routes.server.ts`:

| Route    | Mode        | Why                                    |
| -------- | ----------- | -------------------------------------- |
| `/login` | `Prerender` | Public, identical for everyone, static |
| `**`     | `Client`    | Authenticated, per-user, changes often |

Hydration is enabled with event replay, so a click on the prerendered page that lands
before hydration finishes is not lost.

## Reason

The value taken from SSR in Phase 0 is **enforcement**, not speed. Because a server
build exists and must succeed, any code that reaches for a browser global fails the
build immediately instead of four phases later. That is why SSR is configured now even
though the authenticated application does not use it.

Matching the mode to the nature of each route also makes the public/authenticated
boundary a real, visible thing in the codebase from the first commit — the same
boundary Phase 3's guards and the mock API's authorization will use.

## Consequences

- `npm run build` must produce the server bundle, and Phase 0's Definition of Done
  says so explicitly. A browser-global leak is caught by CI, not by a reviewer.
- Application code cannot assume `window` exists. The platform tokens in
  `core/platform` are the supported way to reach browser capabilities.
- Runtime configuration is fetched in the browser only (ADR-0005), because the
  prerendered route has no per-deployment configuration to honour.
- Phase 5 measures and compares rendering modes instead of introducing them. If it
  wants to try server-rendering an authenticated route, it changes one line here.

## Revisit when

- A genuinely public, content-bearing surface is added — a marketing page, public
  documentation — for which indexing matters.
- Phase 5's measurements show client rendering costing real user-visible time on the
  authenticated entry route.
