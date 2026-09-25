# ADR-0031 — Preload only the routes that ask for it

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Every route is lazy (ADR-0011's shape), which keeps the initial bundle small
but makes the first visit to each section wait for its code. After sign-in,
nearly every session goes straight to the customer list - and on a slow
connection that wait was measured at 1.9 seconds.

## Options considered

### A — `NoPreloading` (the default so far)

- Cons: the wait above, on the most common path.

### B — `PreloadAllModules`

- Cons: downloads every lazy chunk for every user - the technical labs
  included - whether or not they ever open them.

### C — A strategy that preloads routes flagged `preload: true` (chosen)

## Decision

`core/routing/FlaggedPreloading`: preloads a route whose metadata says
`preload: true`, unless the `routePreloading` runtime flag is off or the
browser sends `Save-Data`. Flagged: the authenticated shell, the customers
section and its list page - so they download while the user is still on the
sign-in page.

## Reason

Measured in perf/measure-production.ts, throttled, median of five: sign-in to
the first customer row took **1,916 ms without preloading and 531 ms with it**. The flag costs one line per route, and a route nobody flags costs
nothing.

## Consequences

- The runtime flag doubles as the measurement switch: both runs use the same
  build.
- A route is flagged by the team that owns it, in its own route file.

## Revisit when

- Navigation analytics exist (Phase 7) and can say which routes are "next"
  often enough to preload.
