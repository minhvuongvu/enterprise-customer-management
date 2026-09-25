# ADR-0025 — Measure the initial bundle by package, fix the zod import, and treat the budget as a ratchet

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Since Phase 0.5 the initial JavaScript was about 800 kB raw against a 500 kB
budget (debt row 8). Nobody had said what those 800 kB were, so the debt could
be neither paid nor defended. The Angular CLI prints chunk sizes; it does not
say which packages fill them.

## Options considered

### A — Raise the budget to fit

- Pros: the warning goes away.
- Cons: says nothing about what is in the bundle; a budget moved to fit is a
  budget that will be moved again.

### B — Measure first, then fix what the measurement points at (chosen)

- Pros: every kilobyte gets an owner. `perf/bundle-report.ts` reads the esbuild
  metafile (`ng build --stats-json`) and groups the initial download by package.
- Cons: one more script to keep working.

## Decision

1. `perf/bundle-report.ts` is the tool. Its first run showed **zod: 500.7 kB of
   799 kB** - every locale (≈250 kB) and the JSON-schema converters, none of
   them used.
2. The contracts package imports zod as a namespace - `import * as z from
'zod'` - instead of `import { z } from 'zod'`. The named `z` is a
   re-exported namespace _object_, which esbuild cannot tree-shake; the
   namespace import lets it drop what is never referenced. **808.2 → 481.5 kB
   raw, 183.5 → 131.5 kB transferred**, one line per contract file, no
   behaviour change (all 155 contract and mock API tests unchanged).
3. The budget becomes a **ratchet**: `maximumWarning` is the measured size plus
   a few kilobytes (530 kB), not the CLI's default 500 kB. Growth past it is a
   warning someone must explain; paying debt lowers it.

## Reason

The CLI default of 500 kB was never a product decision. A warning that has
fired on every build since Phase 0.5 had stopped carrying information - the
+17 kB Phase 5 added would have been invisible under it. A budget set just
above the measured size makes the _next_ growth visible, which is what a
budget is for.

Phase 5's own additions to the initial download, each measured by removing it
and rebuilding: the `@defer` runtime (first `@defer` in the application)
**9.6 kB**, `provideServiceWorker` **6.1 kB**, `NgOptimizedImage` **5.4 kB** -
the last one although only a lazy lab page uses it. The cause is the same for
all three: Angular's FESM files keep top-level code with side effects (for
example `new InjectionToken(...)`), and ES module semantics require it to run
when the file is first imported - by the main chunk. Code used only by a lazy
route can therefore still cost every user.

## Consequences

- The initial download is 524.7 kB raw / 142.7 kB transferred at the end of
  Phase 5, under the 530 kB ratchet.
- zod is still the second-largest package in the initial bundle (129.6 kB): the
  session, error and realtime schemas are validated before any lazy route
  loads. That is the price of validating at the boundary (ADR-0008).
- A new dependency, or a new Angular API used for the first time, must be
  measured with `perf/bundle-report.ts`, and the ratchet moved deliberately
  if it is accepted.

## Revisit when

- Anything pays down the initial bundle: lower the ratchet by the same amount.
- zod ships a smaller core, or `zod/mini` becomes worth its different API.
