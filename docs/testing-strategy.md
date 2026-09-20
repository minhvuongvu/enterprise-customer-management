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

## Current state — end of Phase 0

| Suite            | Files | Tests | Status  |
| ---------------- | ----- | ----- | ------- |
| Unit / component | 8     | 39    | passing |
| E2E + a11y       | 1     | 5     | passing |

Covered: time policy, log redaction, HTTP error mapping, platform storage fallbacks,
configuration merging, session initial state, interceptor chain (headers, error
classification, correlation-ID propagation into logs), root component landmark,
routing/redirect/not-found in a browser, axe scan of the public surface.

## Known gaps

These are gaps, not oversights. Each has an owner.

| Gap                                           | Why it is acceptable now                                                      | Closed in |
| --------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| No coverage thresholds                        | Coverage over 39 tests and no features would be a number, not a signal        | Phase 7   |
| One browser (Chromium)                        | There is not enough UI for cross-browser differences to exist                 | Phase 6   |
| No visual regression                          | Nothing has a stable visual identity yet                                      | Phase 7   |
| No architecture/dependency tests              | Boundaries are enforced by review until there are boundaries worth automating | Phase 7   |
| `provideRuntimeConfig` not covered end to end | Needs a server to fetch from                                                  | Phase 0.5 |
| No mock-API integration tests                 | There is no API                                                               | Phase 0.5 |

## How this grows

Phase 0.5 adds contract tests and API integration tests against the real mock server.
Phase 2 adds the first feature-level integration tests and the CRUD E2E journey.
Phase 7 reviews the whole pyramid, adds coverage gates and wires it into CI.
