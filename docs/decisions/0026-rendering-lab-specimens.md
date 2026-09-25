# ADR-0026 — Measure rendering modes on public, data-free specimen routes

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Phase 5 must compare CSR, SSR, hydration (including incremental hydration) and
prerendering with real numbers - TTFB, FCP/LCP, hydration time, bytes. §5.6
keeps the authenticated application client-rendered and forbids extending SSR
to it. So the comparison needs pages that _can_ be rendered every way, without
changing what the application does.

## Options considered

### A — Server-render the real customer pages for the experiment

- Cons: the server would need the session - cookies forwarded into the
  renderer, per-user HTML - which is exactly what §5.6 and ADR-0003 rule out.
  An experiment that changes the security boundary is not an experiment.

### B — Measure `/login` only

- Cons: one page, one mode. It cannot show SSR vs prerender, and has almost
  nothing to hydrate.

### C — Five specimen routes of one page, public and data-free (chosen)

`/rendering-lab/{client, server, prerender, prerender-no-hydration,
prerender-incremental}` - the same component, the same generated rows, the
same JavaScript. Only the render mode (`app.routes.server.ts`) and one
hydration switch on the below-the-fold catalogue (`ngSkipHydration`,
`@defer (hydrate on viewport)`) differ.

## Decision

Option C. The specimens live outside the shell, under the rendering lab's own
route file; they read no API and carry `robots: noindex`. The comparison runs
in `perf/measure-rendering.ts` against the production server, in fresh
browser contexts, unthrottled and throttled (4x CPU, 150 ms RTT, 1.6 Mbps),
median of seven runs. `main.ts` marks bootstrap start and application-stable
so hydration time is read, not estimated. `withIncrementalHydration()` is
enabled application-wide: it changes nothing without a `@defer (hydrate ...)`
block, and costs no measurable bytes by itself.

## Reason

Holding everything but the rendering constant is what makes a difference in
the numbers attributable. Public, data-free pages are the only kind the server
may render under §5.6, so the constraint and the experimental design agree.

## Consequences

- Five public routes exist that no user navigates to. They are marked
  `noindex` and contain nothing but generated rows.
- The first `@defer` block costs 9.6 kB of initial JavaScript for the whole
  application (ADR-0025) - paid here by a lab; any later `@defer` gets it free.
- The results and their interpretation are in docs/rendering.md.

## Revisit when

- An authenticated page is ever proposed for server rendering: it needs its
  own ADR, superseding ADR-0003, not a specimen.
