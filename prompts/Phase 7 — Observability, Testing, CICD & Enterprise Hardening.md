Continue working on the existing Angular enterprise learning repository.

This is Phase 7.

## Objective

Harden the repository for production-like development.

Focus on:

- testing strategy
- observability
- CI/CD
- quality gates
- performance monitoring
- error tracking
- architecture enforcement
- developer experience

## Testing Strategy

Review the entire test suite.

Ensure appropriate coverage for:

### Unit

- utilities
- validators
- state logic
- API mapping
- business rules

### Component

- inputs
- outputs
- DOM behavior
- loading
- error
- empty
- accessibility

### Integration

Test meaningful flows across:

component

- state
- API

### E2E

Cover critical user journeys:

- login
- list
- search
- filtering
- pagination
- detail
- create
- edit
- delete
- authorization
- file upload
- import
- conflict handling

### Visual Regression

Apply visual regression selectively to:

- design system components
- critical pages

Do not create visual snapshots for every element.

## Mocking

Review mocking architecture.

Mocks must be reusable and deterministic.

Use generated test data where useful.

Avoid duplicating mock data across tests.

## Observability

Implement:

- structured client logging
- error tracking abstraction
- performance measurements
- API latency measurement
- correlation ID
- important user interaction events

Do not log:

- passwords
- access tokens
- sensitive personal data unnecessarily

## Performance Monitoring

Measure:

- initial load
- route navigation
- API latency
- long tasks where practical
- bundle size

Set reasonable budgets or thresholds.

## CI

Create CI pipeline:

install
→ lint
→ typecheck
→ unit/component tests
→ build
→ E2E
→ accessibility checks
→ optional bundle analysis

Fail the pipeline on critical quality failures.

## Code Quality

Enforce:

- formatting
- linting
- strict TypeScript
- no circular dependency
- no forbidden imports
- no accidental public API violations

If practical, add architecture/dependency checks.

## Feature Flags

Introduce a small feature flag system.

Support:

- build-time flags
- runtime flags

Document when each should be used.

Do not implement a complex enterprise feature flag platform.

## Configuration

Review:

development
test
staging
production

Separate:

- build-time configuration
- runtime configuration
- secrets

Never commit secrets.

## Architecture Review

Review the entire repository.

Look for:

- circular dependencies
- duplicated logic
- inappropriate shared components
- overly large components
- services doing too much
- global state used unnecessarily
- feature leakage
- infrastructure leaking into UI
- excessive abstraction

Refactor only where there is a clear benefit.

## Final Report

Produce:

1. Architecture overview
2. Dependency graph
3. State architecture
4. API architecture
5. Testing pyramid
6. Security architecture
7. Observability architecture
8. Performance strategy
9. CI pipeline
10. Known technical debt
11. Recommended future improvements

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
- [ ] The CI pipeline runs end to end and fails the build on a real quality-gate violation — proven deliberately
- [ ] Performance budgets are enforced by CI, not merely documented
- [ ] A test proves that secrets, tokens and sensitive personal data are redacted from logs
- [ ] Correlation IDs flow from the frontend through to the mock API and appear in both logs
- [ ] An architecture/dependency check runs in CI: no circular dependencies, no forbidden imports
- [ ] No secrets are committed; build-time, runtime and secret configuration are clearly separated
- [ ] The testing pyramid is described with real numbers and its gaps are named
- [ ] Feature flags support both build-time and runtime use, with documented guidance on which to use when
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-7` and tagged
