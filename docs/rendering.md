# Rendering

How each route is rendered, what the server and the browser each do, and what
the rendering modes actually cost and save **here**, measured. Decisions:
[ADR-0003](decisions/0003-render-modes.md) (modes per route),
[ADR-0026](decisions/0026-rendering-lab-specimens.md) (how they are compared).

## The modes in use

| Route                     | Mode                        | Why                                                       |
| ------------------------- | --------------------------- | --------------------------------------------------------- |
| `/login`                  | prerendered, hydrated       | public, identical for everyone                            |
| everything behind sign-in | client-rendered             | per user; SSR would need the session on the server (§5.6) |
| `/rendering-lab/*`        | one of each - the specimens | public, data-free, exist to be measured                   |

**The authenticated application stays client-rendered.** Nothing below argues
otherwise: a back office has no crawler to serve (§7.1), and server-rendering
per-user pages puts session handling in the render path.

## Rendering lifecycle

```text
                     server / build                         browser
CSR        index.csr.html (4.8 kB, empty <app-root>) ──► download JS ─► bootstrap ─► render ─► paint ─► stable
SSR        render the route for this request ──────────► paint HTML ─► download JS ─► bootstrap ─► hydrate ─► stable
Prerender  render once at build → static file ─────────► paint HTML ─► download JS ─► bootstrap ─► hydrate ─► stable
```

- **Server** (SSR, prerender): runs the same components with `platform-server`;
  `WINDOW`/`NAVIGATOR` are `null`, storage is a no-op, `IS_BROWSER` is false;
  the runtime configuration initializer is skipped (ADR-0005). It serialises
  the DOM plus hydration annotations (`ngh`) and the event-replay script.
- **Browser**: `main.ts` marks `ecm:bootstrap-start`, bootstraps, fetches
  `/config.json` (an app initializer - it delays hydration too), then either
  renders from scratch (CSR) or **hydrates**: walks the server's DOM, matches
  it to the templates, attaches listeners, and replays clicks captured before
  it finished (`withEventReplay`). `ecm:app-stable` is marked when
  `ApplicationRef.whenStable()` resolves.

### Hydration variants in the specimens

- **Full** (`server`, `prerender`): every component hydrated at bootstrap.
- **Destructive** (`prerender-no-hydration`): the catalogue has
  `ngSkipHydration`; its server DOM is removed and rebuilt (a `MutationObserver`
  sees the `<table>` removed and re-inserted).
- **Incremental** (`prerender-incremental`): the catalogue is in
  `@defer (hydrate on viewport)` - it stays inert server HTML until scrolled
  into view; a click on it before then is replayed after it hydrates.

## Measurements

`node perf/measure-rendering.ts --runs 7` against the production build
(`dist/web/server/server.mjs`), Chromium, a fresh context per load (no cache,
no service worker), route preloading off. **Median of 7 runs** after one
discarded warm-up. Raw results: `perf/results/rendering.json`. 2026-09-25.

- **TTFB** - request sent to response headers received (DevTools timing).
- **FCP / LCP** - the browser's paint entries.
- **Stable at** - `ecm:app-stable`, from navigation start: the page is
  interactive and nothing is pending.
- **Bootstrap → stable** - the JavaScript's own work: hydration for SSR and
  prerender, rendering for CSR.
- **Bytes** - transferred, from the DevTools protocol, headers included.

### Unthrottled (this machine)

| Page                                    | TTFB | FCP | LCP | Stable at | Bootstrap → stable | HTML bytes | Total bytes |
| --------------------------------------- | ---: | --: | --: | --------: | -----------------: | ---------: | ----------: |
| `/rendering-lab/client`                 |    2 | 208 | 208 |       151 |                 75 |      4,845 |     571,347 |
| `/rendering-lab/server`                 |   21 | 148 | 148 |       269 |                 97 |    149,085 |     715,587 |
| `/rendering-lab/prerender`              |    2 | 112 | 112 |       208 |                 88 |    149,166 |     715,668 |
| `/rendering-lab/prerender-no-hydration` |    2 | 104 | 104 |       216 |                 98 |    141,460 |     707,962 |
| `/rendering-lab/prerender-incremental`  |    2 | 104 | 104 |       190 |                 74 |    152,900 |     719,402 |
| `/login` (prerendered)                  |    1 |  56 |  56 |       139 |                 68 |     15,474 |     726,840 |

### Throttled (4x CPU, 150 ms RTT, 1.6 Mbps down)

| Page                                    | TTFB |   FCP |   LCP | Stable at | Bootstrap → stable | HTML bytes | Total bytes |
| --------------------------------------- | ---: | ----: | ----: | --------: | -----------------: | ---------: | ----------: |
| `/rendering-lab/client`                 |  154 | 3,804 | 3,804 |     3,318 |                259 |      4,845 |     571,347 |
| `/rendering-lab/server`                 |  154 |   220 | 4,504 |     4,073 |                326 |    149,085 |     715,587 |
| `/rendering-lab/prerender`              |  154 |   224 | 4,488 |     4,120 |                348 |    149,166 |     715,668 |
| `/rendering-lab/prerender-no-hydration` |  153 |   224 | 4,504 |     4,071 |                345 |    141,460 |     707,962 |
| `/rendering-lab/prerender-incremental`  |  153 |   224 | 4,336 |     4,103 |                317 |    152,900 |     719,402 |
| `/login` (prerendered)                  |  153 |   264 |   264 |     4,026 |                249 |     15,474 |     726,840 |

All times in milliseconds. Differences of about 10 ms or less in the
unthrottled table are within the variation seen between repeated runs of the
script; read them as equal.

## What the numbers say

**1. Server HTML buys first paint, and only first paint.** Throttled, content
is on screen at 220-224 ms from the server or the build versus 3,804 ms
client-rendered - **17x sooner**. The page becomes _usable_ no sooner: stable at
4,073-4,120 ms versus 3,318 ms for CSR, about **0.8 s later**: the 149 kB
document shares the 1.6 Mbps with the JavaScript (the shared chunks are
`modulepreload`ed from `<head>`), and `main.js` itself is only discovered at
byte 148,082 of it, at the end of `<body>`.
Between first paint and stable, the page looks ready and is not: buttons do
nothing until hydrated (event replay keeps the clicks; typing is the case
debt row 13 was about - see below).

**2. Hydration is not cheaper than rendering here - it costs more.**
Bootstrap → stable: 259 ms (CSR render) versus 326-348 ms (full hydration),
throttled; 75 versus 88-97 ms unthrottled. Walking and matching 400 rows of
existing DOM costs more than creating them. What hydration buys over throwing
the server DOM away is not speed: the destructive specimen costs the same
(345 vs 348 ms) and, in exchange, rebuilds the table - a visible flash on a
slow device, and any state in that DOM (scroll, focus, a half-typed field)
lost.

**3. Incremental hydration saves the part not yet visible.** Deferring the
catalogue until it scrolls into view cut bootstrap → stable by **31 ms
throttled (348 → 317, 9%)** and 14 ms unthrottled (88 → 74). The cost moves to
the first scroll, and the incremental specimen still downloads all the
JavaScript (1-4 kB more HTML for the defer annotations).

**4. SSR costs a render per request.** TTFB 21 ms versus 2 ms for the same
page prerendered - about 19 ms of server work per request, for a page that
never changes. Throttled, the 150 ms round trip hides it. Prerender is the
right mode for anything identical for everyone; SSR earns its cost only when
the HTML depends on the request.

**5. The HTML is the bytes.** Server-rendered pages transfer 144 kB more than
CSR (149 kB versus 4.8 kB of HTML), because the Express server in
`src/server.ts` does not compress. Behind a compressing proxy that difference
shrinks by an order of magnitude - not measured here, and not claimed.

**6. LCP under throttling reports hydration, not paint.** Server-rendered
specimens show FCP at ~220 ms but LCP at ~4.4 s, close to "stable". The page
did not repaint visibly: a `MutationObserver` during hydration records
Angular re-setting bound text nodes and attributes to their _identical_
values, and Chrome's LCP then reports the largest text block again, larger
than the first candidate painted while the HTML was still streaming.
Unthrottled, LCP equals FCP. The mechanism was observed, not established from
Chrome's source; FCP is the number that matches what the user saw.

**7. `/login`**: prerendered, first paint at 264 ms throttled, stable at
4,026 ms. That ~3.8 s gap is the window in which typing used to be lost.

## Debt row 13 - paid

Typing into the prerendered sign-in form before hydration was discarded: the
browser kept the text in the `<input>`, then binding the empty form controls
wrote `''` over it. Reproduced on the production build with the throttled
profile (typed "admin" before `ecm:app-stable`; value after hydration: `""`).

Fix, in `login-page.ts`: before the form controls exist, read the inputs'
current values from the document (`readTypedValues`) and start the controls
from them. On the server and on a client-side navigation there is nothing
typed, and both read empty. `e2e-production/login-hydration.spec.ts` types
before hydration on the throttled profile and asserts the text survives; it
fails on the previous build and passes on this one. `/login` stays
prerendered (ADR-0016).

## Platform safety held

Nine lab pages, a Web Worker, a service worker and cross-tab messaging were
added, and the server build succeeded at every step. No direct global slipped
in and no `isPlatformBrowser` guard was added: everything went through the
tokens in `core/platform` (docs/browser-capabilities.md).

## Per technique

### Prerendering the public surface

- **Problem**: a static public page should appear before its JavaScript runs.
- **Solution**: `RenderMode.Prerender` - HTML produced at build time.
- **Why**: first paint 17x sooner throttled, and no server work per request
  (TTFB 2 ms vs 21 ms for SSR).
- **Alternative**: SSR (same paint, per-request cost); CSR (no server, blank
  until the JavaScript has run).
- **Trade-offs**: a window between paint and interactivity (~3.8 s throttled on
  `/login`); +144 kB uncompressed HTML on a large page; the page must not depend
  on who asks.
- **When not to use it**: per-user or frequently changing content.

### Server-side rendering

- **Problem**: content that depends on the request must appear before the
  JavaScript runs.
- **Solution**: `RenderMode.Server`.
- **Why**: first paint like prerendering, for content prerendering cannot know.
- **Alternative**: prerender (if the content is static), CSR with a skeleton.
- **Trade-offs**: a render per request (19 ms here, per page per request); a
  server to run; with a session, per-user HTML and the risk of serving one
  user's page to another.
- **When not to use it**: authenticated back-office pages (this repository,
  §5.6); anything static.

### Hydration

- **Problem**: server HTML must become the live application without being
  thrown away.
- **Solution**: `provideClientHydration()` - reuse the DOM, attach listeners.
- **Why**: no flash and no lost DOM state, at the cost of rendering (measured:
  slightly _more_ than rendering, 348 vs 259 ms throttled).
- **Alternative**: destructive re-render (`ngSkipHydration`) - same cost here,
  rebuilds the DOM.
- **Trade-offs**: the server and client must render identically (deterministic
  data - the specimens use no `Math.random()` or clock); the page looks ready
  before it is.
- **When not to use it**: for components that cannot render identically on the
  server - mark those `ngSkipHydration`.

### Incremental hydration

- **Problem**: hydrating content the user has not reached yet delays
  interactivity for what they have.
- **Solution**: `@defer (hydrate on viewport)` with `withIncrementalHydration()`.
- **Why**: 9% less work before stable here, and more on pages whose heavy part
  is further down.
- **Alternative**: full hydration; client-only `@defer` (no server HTML for the
  block at all).
- **Trade-offs**: the block is inert until its trigger; the first `@defer` in
  the application puts 9.6 kB of runtime into the initial bundle (ADR-0025).
- **When not to use it**: above the fold, or for content the user interacts
  with at once.

### Client-side rendering

- **Problem**: per-user, interactive pages behind sign-in.
- **Solution**: `RenderMode.Client` - the default for `**`.
- **Why**: stable 0.8 s _sooner_ than the server-rendered specimens throttled
  (3,318 vs ~4,100 ms), no server, no session on the server.
- **Alternative**: SSR - rejected for this application (§5.6).
- **Trade-offs**: nothing on screen until the JavaScript has run (3.8 s
  throttled) - mitigated by keeping the initial bundle small (ADR-0025) and
  preloading the next route (ADR-0031).
- **When not to use it**: public content that must appear fast or be crawled.
