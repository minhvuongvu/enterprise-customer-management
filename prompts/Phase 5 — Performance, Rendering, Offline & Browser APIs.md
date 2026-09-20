Continue working on the existing Angular enterprise learning repository.

This is Phase 5.

## Objective

Study and implement advanced Angular rendering, browser capabilities, performance, offline behavior, and client-side synchronization.

Do not unnecessarily modify the core Customer feature.

Create technical-lab modules for experiments.

## Rendering Lab

SSR was configured in Phase 0 (see §5.6) precisely so that this phase does not have to retrofit it. This lab **measures and compares** rendering modes; it does not introduce them.

Compare, with evidence:

- CSR
- SSR
- hydration — including incremental hydration if the installed version supports it
- prerendering of the public surface

Document:

- rendering lifecycle
- server vs client responsibilities
- what hydration actually costs and saves here
- limitations
- trade-offs

Report real measurements: TTFB, FCP/LCP, hydration time, transferred bytes. Do not state that one mode is better without numbers.

Confirm the platform-safety tokens are still holding — any direct browser-global access that slipped into the app will surface here as a server-build failure. Fix those in place; do not add `isPlatformBrowser` guards to paper over a global that should have been injected.

The authenticated application stays client-rendered. Do not extend SSR to it for SEO reasons — §7.1 scopes SEO to the public surface, and this application is a back office.

## Performance Lab

Demonstrate:

- lazy loading
- code splitting
- preloading/prefetching where appropriate
- debouncing
- throttling
- memoization/derived state
- virtual scrolling
- image optimization
- bundle analysis

Create a large dataset scenario to make performance differences measurable.

Measure before/after rather than claiming an optimization is beneficial without evidence.

## Browser API Lab

Demonstrate:

- localStorage
- sessionStorage
- IndexedDB
- History API
- URL API
- File API
- Clipboard API
- Web Worker
- Service Worker
- browser permissions
- Geolocation

Do not use fake abstractions.

Each lab should contain:

- use case
- implementation
- limitations
- browser considerations
- tests where practical

## Offline

Implement a limited offline scenario.

Support:

- online/offline detection
- offline UI
- cached read-only data
- reconnect detection

If implementing write queueing, explicitly document consistency behavior.

Do not claim full offline-first support unless it is actually implemented.

## Cross-tab Communication

Demonstrate:

BroadcastChannel

Scenario:

Tab A changes customer-related state.

Tab B receives notification.

Also demonstrate storage events where useful.

## Advanced Synchronization Lab

Create an isolated experiment for leader election across tabs.

Only one tab should perform a periodic background operation.

Other tabs receive the result.

Document:

- leader election algorithm
- failure mode
- race conditions
- limitations
- browser lifecycle issues

This is a learning experiment, not a production distributed lock.

## Testing

Add tests appropriate to each lab.

For browser-dependent functionality, clearly distinguish:

- unit tests
- browser integration tests
- E2E tests

Run performance measurements where practical.

## Documentation

Create:

docs/performance.md
docs/rendering.md
docs/offline.md
docs/browser-capabilities.md
docs/cross-tab.md

Every advanced technique must include:

Problem
Solution
Why this solution
Alternative
Trade-offs
When not to use it

Do not pollute the main business feature with unnecessary experimental code.

---

## Definition of Done

Do not report this phase as complete until every item holds. Report any failing item as failing, with its output. Never mark a phase done with a known-broken check.

- [ ] `npm run format` clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` clean under `strict` + `strictTemplates`
- [ ] `npm run test` passing, meaningful assertions, no `.skip` left behind
- [ ] `npm run build` succeeds, including the server build
- [ ] `npm run e2e` passing
- [ ] The non-negotiable rules in `CLAUDE.md` hold for all new code
- [ ] No circular dependencies introduced
- [ ] No later-phase scope implemented, and no unrelated refactoring
- [ ] Every performance claim is backed by a before/after measurement, with the numbers in the docs
- [ ] The rendering comparison reports real TTFB / FCP / LCP / hydration time / transferred bytes
- [ ] The server build still succeeds — no browser global leaked into application code
- [ ] Labs are isolated; the Customer feature is unchanged except where explicitly justified
- [ ] Offline documentation describes exactly what is implemented — no claim of offline-first unless it is actually implemented
- [ ] Leader election documents its algorithm, failure modes, race conditions and limitations
- [ ] Each lab states: problem, solution, why this solution, alternative, trade-offs, when not to use it
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-5` and tagged
