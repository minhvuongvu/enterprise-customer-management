# Performance

Every claim here has a before and an after, measured, with the script that
measured it. Nothing is called faster without a number. Decisions:
[ADR-0025](decisions/0025-bundle-budget-as-a-ratchet.md) (bundle),
[ADR-0031](decisions/0031-flagged-route-preloading.md) (preloading).
Rendering modes are measured separately in [rendering.md](rendering.md).

## How it was measured

| Script                            | Against                               | Method                                                                                                        |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `node perf/bundle-report.ts`      | `ng build --stats-json`               | the esbuild metafile: the initial chunk closure, bytes per package                                            |
| `node perf/measure-production.ts` | production build + mock API, Chromium | fresh context per run, **median of 5 runs**; preloading on a throttled profile (4x CPU, 150 ms RTT, 1.6 Mbps) |

Results: `perf/results/bundle.txt`, `perf/results/production.json`,
2026-09-25, one machine. Absolute numbers depend on it; the ratios are the
point. The lab pages (`/technical-labs/performance`, `/technical-labs/workers`)
show the same measurements live, for one run on your machine.

The dataset: 100,000 rows generated in the browser, deterministically
(`performance-dataset.ts`) - no network variance in the numbers.

## Results

| Technique                                             | Before                                          | After                                          | Change                                      |
| ----------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------- |
| Initial JavaScript (zod import)                       | 808.2 kB raw / 183.5 kB transferred             | 481.5 kB raw / 131.5 kB transferred            | **−40% raw**                                |
| Route preloading, sign-in → customer list (throttled) | 1,916 ms                                        | 531 ms                                         | **−72%**                                    |
| Debounced search, typing 9 characters                 | 9 scans of 100,000 rows, 52 ms                  | 1 scan, 6 ms                                   | **−89%** work                               |
| `computed()` vs template method, 50 unrelated renders | 50 recomputations, 167 ms                       | 0 recomputations, 2 ms                         | **−99%**                                    |
| Virtual scrolling                                     | 10,000 rows plain: 124 ms, 10,019 elements      | 100,000 rows virtual: 29 ms, 21 elements       | 10x the rows, **−77%** time, **−99.8%** DOM |
| Image optimization, 12 cards                          | 16,378 KB (original PNG uploads)                | 53 KB (WebP at rendered size)                  | **−99.7%** bytes                            |
| Web Worker, 20M-number prime sieve                    | main thread: longest frame 178 ms (page frozen) | worker: longest frame 17 ms                    | page stays at 60 fps; total +22 ms          |
| Code splitting (`@defer on viewport`)                 | CDK scrolling in the lab's chunk                | 4.1 kB + 26.3 kB fetched only when scrolled to | 30 kB off the page's first load             |

The initial bundle at the end of Phase 5 is **524.6 kB raw / 143.2 kB
transferred** - the zod fix, minus what Phase 5 added (below).

---

## Bundle analysis

- **Problem**: the initial download was 808 kB against a 500 kB budget since
  Phase 0.5 (debt row 8), and nobody knew what was in it.
- **Solution**: `perf/bundle-report.ts` - the metafile, grouped by package.
  It showed **zod at 500.7 kB of 799 kB**: every locale and the
  JSON-schema converters. The contracts imported `{ z } from 'zod'`, a
  re-exported namespace object esbuild cannot tree-shake; `import * as z from
'zod'` can be. One line per contract file.
- **Why this solution**: measuring first turned an unexplained warning into a
  one-line fix. No behaviour change: 155 contract and mock API tests unchanged.
- **Alternative**: `zod/mini` (smaller, a different API everywhere); moving
  validation out of the initial path (validates later than the boundary).
- **Trade-offs**: zod is still 129.6 kB of the initial download - the price of
  validating the session, errors and realtime events before any route loads.
- **When not to use it**: - (measuring is always warranted; the fix is
  specific to zod 4's classic API).

The initial download by package, end of Phase 5:

| Package                     | kB raw |
| --------------------------- | -----: |
| `@angular/core`             |  242.0 |
| `zod`                       |  129.6 |
| `@angular/router`           |  102.2 |
| `@angular/common`           |   64.1 |
| `rxjs`                      |   34.0 |
| `@jsverse/transloco`        |   21.0 |
| `@angular/platform-browser` |   18.7 |
| application `core/`         |   16.4 |
| `@angular/service-worker`   |    7.3 |
| other                       |    7.0 |

**What Phase 5 added to it, measured by removing each and rebuilding**: the
`@defer` runtime (first `@defer` in the application) **9.6 kB**,
`provideServiceWorker` **6.1 kB**, `NgOptimizedImage` **5.4 kB** - although
only a lazy lab page uses it. Angular's FESM files keep top-level code with
side effects (`new InjectionToken(...)` and the like), and ES module semantics
require it to run when the file is first imported, which is by the main
chunk. _Code used only by a lazy route can still cost every user._ Disabling
the Angular CLI's chunk optimizer (`NG_BUILD_OPTIMIZE_CHUNKS=0`) did not
change this (521.3 vs 524.7 kB) - it is esbuild's placement, not the merge.

The budget is now a ratchet: `maximumWarning` 530 kB, just above the measured
size, so the next growth is visible (ADR-0025).

## Lazy loading and code splitting

- **Problem**: every page's code in one download makes the first page wait for
  all the others.
- **Solution**: every route is `loadComponent` / `loadChildren` (since Phase
  1); inside a page, `@defer (on viewport)` splits a heavy block - the virtual
  scrolling demo's own 4.1 kB plus the CDK scrolling chunk (26.3 kB) are
  fetched only when it scrolls into view.
- **Why**: the initial chunk holds only the shell and the core; the lab
  pages add nothing to it except the side-effect cost above.
- **Alternative**: one bundle (simpler, slower first load); manual
  `import()` in code (what `@defer` generates, without the template states).
- **Trade-offs**: a request - and a placeholder - when the block appears; the
  first `@defer` costs 9.6 kB in the initial bundle.
- **When not to use it**: above the fold, or for something the user needs at
  once.

## Preloading

- **Problem**: after sign-in, nearly every session opens the customer list,
  and its code was only requested then - **1,916 ms** from the click to the
  first row, throttled.
- **Solution**: `FlaggedPreloading` - preload routes marked `preload: true`
  (the shell, the customers section, the list page) once the first navigation
  settles; skipped when the `routePreloading` flag is off or the browser sends
  `Save-Data`. With it: **531 ms**. The code is downloaded while the user types
  their credentials.
- **Why**: targeted; the measurement toggles the runtime flag, so both runs
  used one build.
- **Alternative**: `PreloadAllModules` (downloads every lab page too, for
  everyone); preloading on hover / `quicklink` (more requests, more logic).
- **Trade-offs**: bytes downloaded that a user who never signs in did not need;
  a flag on the route to maintain.
- **When not to use it**: metered connections (respected via `Save-Data`), or
  routes that are rarely the next step.

## Debouncing and throttling

- **Problem**: a search that scans 100,000 rows on every keystroke does the
  work once per character typed.
- **Solution**: `debounceTime(250)` - run once typing pauses. Typing "anbel
  cor" at a normal pace: **9 scans, 52 ms → 1 scan, 6 ms**. For continuous
  feedback (a pointer tracker), `throttleTime(100)` lets through at most one
  event per 100 ms while the pointer moves (the lab counts raw vs handled).
- **Why**: debounce suits "the final value matters"; throttle suits "show
  progress while it happens". The customer list's search is debounced in the
  field, not the store (`customer-filters.ts`).
- **Alternative**: cancel the previous work (`switchMap` - the store does this
  for requests); make the work cheaper (an index).
- **Trade-offs**: debounce adds its delay to every search; throttle drops
  intermediate events by design.
- **When not to use it**: when each event must be handled (a keystroke that
  edits), or when the work is already cheap.

## Memoization and derived state

- **Problem**: a value derived from 100,000 rows, computed by a method called
  from the template, is recomputed on every render - whatever triggered it.
- **Solution**: `computed()` - re-evaluated only when a signal it read changes.
  Fifty renders caused by an unrelated counter: **50 recomputations in 167 ms
  → 0 in 2 ms**.
- **Why**: signals know their dependencies; a template method cannot.
- **Alternative**: a pure pipe (memoizes on its inputs, template-only); caching
  by hand.
- **Trade-offs**: a `computed()` holds its last value in memory; its reads
  must be signals, or it will not know to recompute.
- **When not to use it**: for trivial derivations - the cache check costs
  about as much as the work.

## Virtual scrolling

- **Problem**: a plain list renders every row: 10,000 rows took **124 ms** and
  left **10,019 elements** in the page; 100,000 would stall the tab for
  seconds (the lab caps the plain list at 10,000).
- **Solution**: CDK `cdk-virtual-scroll-viewport` renders only the rows in
  view: 100,000 rows in **29 ms** with **21 elements**. Times include style
  and layout (the demo forces layout before stopping the clock).
- **Why**: DOM size, not data size, is what costs - and virtual scrolling
  makes it constant.
- **Alternative**: pagination (what the customer list does - it pages at the
  API, so it never holds more than 100 rows); `content-visibility: auto` (the
  browser skips rendering off-screen rows, the DOM stays).
- **Trade-offs**: fixed row height (`itemSize`), no browser find-in-page for
  unrendered rows, printing shows only the viewport, and screen readers see
  only the rendered rows.
- **When not to use it**: below about a thousand rows (1,000 plain rows took
  34 ms - no problem to solve), or where the list is paged anyway.

## Image optimization

- **Problem**: twelve cards showing original uploads - 1,200 px PNGs - download
  **16,378 KB** to display 16 rem images.
- **Solution**: `NgOptimizedImage` with a loader choosing among generated
  WebP widths (400/800/1600): `srcset` + `sizes` pick the 400 px file for a 16
  rem card on a 1x screen. **53 KB** - 0.3% of the bytes. It also sets
  `width`/`height` (no layout shift), `fetchpriority="high"` on the first image
  and `loading="lazy"` on the rest.
- **Why**: format and size dominate; `NgOptimizedImage` makes the right
  attributes the default and warns in development when they are missing.
- **Alternative**: an image CDN resizing on request (what the loader stands in
  for); `<picture>` written by hand.
- **Trade-offs**: needs the files at several widths (generated by
  `perf/generate-lab-images.ts`), a loader, and 5.4 kB in the initial bundle.
- **Measured, not assumed - lazy loading did nothing here**: both variants
  requested all 12 images. Chromium starts lazy images within about 1,250 px
  of the viewport, and the whole grid is that close. Lazy loading helps long
  pages, not a grid below the fold of a short one.
- **When not to use it**: for icons and SVG, or images whose size the layout
  cannot know.

## Web Worker

- **Problem**: counting the primes below twenty million on the main thread
  froze the page: the longest gap between frames was **178 ms** (no input, no
  animation for that long).
- **Solution**: the same function in a worker: longest frame **17 ms** - one
  normal frame - while the count runs. Total time 172 → 194 ms: the worker
  pays for its start-up and messaging.
- **Why**: the only way to use another thread from a page.
- **Alternative**: yield to the browser between chunks (`scheduler.yield()`),
  or compute on the server.
- **Trade-offs**: +22 ms here; data is copied in and out; no DOM or Angular in
  the worker; a second TypeScript configuration.
- **When not to use it**: for work under a frame (~16 ms), or when copying the
  data costs more than the work.
- Measured with `performance.now()` inside `requestAnimationFrame`: the
  callback's own timestamp argument hid the freeze entirely in headless
  Chromium, which synthesises frame times.
