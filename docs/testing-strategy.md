# Testing strategy

## What each level is for

| Level         | Tool                             | Answers                                                  | Lives in                        |
| ------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------- |
| Unit          | Vitest                           | does this logic hold, including its edge cases           | next to the source, `*.spec.ts` |
| Component     | Vitest + `TestBed`               | does the component render and behave as the user sees it | next to the component           |
| Integration   | Vitest + `HttpTestingController` | do these pieces agree with each other                    | next to the feature             |
| E2E           | Playwright                       | does the real journey work in a real browser             | `e2e/`                          |
| Accessibility | `@axe-core/playwright`           | is the rendered page usable                              | inside the E2E specs            |

Accessibility is not a separate suite. It runs inside the E2E tests, against the same
pages a user gets, because an a11y check against something other than the shipped DOM
tests nothing.

## What to test

Behaviour and contracts. A test should fail when the application becomes wrong, and
only then.

Concretely, from Phase 0's own suite:

- `parseDateOnly('2026-02-30')` returns `null` — the test names the bug it prevents
  (`new Date()` rolling the day over) rather than restating the implementation.
- `redact()` hides `password`, `accessToken`, `refresh_token` and `Authorization`, and
  keeps everything else. The rule is "credentials never reach a log sink"; the test
  checks that rule, not the substring matcher behind it.
- A 404 response reaches the caller as `kind: 'not-found'` with a translation key, and
  the backend's body does not. That is the contract the whole error taxonomy rests on.
- Storage degrades to a no-op when `window` is absent and when the browser throws on
  access. Both are real: server rendering, and a private window.

## What not to test

- Private methods, or that a method was called. Assert the outcome.
- Framework behaviour. Angular's router works.
- Snapshots of markup that nobody reads when they break.
- Anything that needs the source open beside it to understand.

## Conventions

- Tests sit next to their subject. A folder with no tests is visible.
- `describe` names the unit; `it` completes a sentence about behaviour, not about code.
- Where the assertion is non-obvious, the comment says _why the bug it prevents is
  worth preventing_, not what the line does.
- Fakes are written by hand when they are small (see `RecordingLogger`). A hand-written
  double that states its contract beats a mock whose setup is longer than the test.
- Every test is deterministic. No wall-clock dependence, no ordering dependence, no
  shared mutable state between tests.

## Current state — end of Phase 0.5

| Suite                       | Files | Tests | Status  |
| --------------------------- | ----- | ----- | ------- |
| `@ecm/web` unit / component | 9     | 43    | passing |
| `@ecm/mock-api` integration | 8     | 101   | passing |
| `@ecm/contracts` contract   | 1     | 23    | passing |
| E2E + accessibility         | 2     | 9     | passing |

**API tests run against the real server** on an ephemeral port, not against handlers
invoked in process. Cookies, CORS, status codes and streaming are what that server
exists to provide, and none of them are exercised by calling an Express handler
directly.

**Contract tests import the package by name**, so they run against the built artifact
everyone else consumes rather than against source that might compile differently.

Covered: the Phase 0 seams; every documented status code and the error envelope; paging,
sorting, filtering, search, CRUD, optimistic concurrency, audit and bulk partial failure;
the role matrix enforced server-side with no UI involved; cookie flags, CSRF, refresh
rotation and replay; every fault-injection scenario; seed determinism and data realism;
upload, CSV partial import and export; the SSE wire format; and the application-to-API
wiring in a browser.

## Known gaps

These are gaps, not oversights. Each has an owner.

| Gap                                               | Why it is acceptable now                                                      | Closed in |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| No coverage thresholds                            | Coverage over 39 tests and no features would be a number, not a signal        | Phase 7   |
| One browser (Chromium)                            | There is not enough UI for cross-browser differences to exist                 | Phase 6   |
| No visual regression                              | Nothing has a stable visual identity yet                                      | Phase 7   |
| No architecture/dependency tests                  | Boundaries are enforced by review until there are boundaries worth automating | Phase 7   |
| `provideRuntimeConfig` not covered end to end     | The browser fetch of `config.json` still has no test                          | Phase 1   |
| Bulk `CONFLICT` outcome only reached by injection | A natural version race needs two concurrent clients                           | Phase 4   |

## How this grows

Phase 2 adds the first feature-level integration tests and the CRUD E2E journey.
Phase 7 reviews the whole pyramid, adds coverage gates and wires it into CI.
