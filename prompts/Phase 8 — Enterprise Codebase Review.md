You are now acting as a Staff/Principal Angular Engineer reviewing an existing enterprise learning repository.

Do NOT add major features.

The objective is to evaluate whether this repository teaches the architecture and engineering practices found in real enterprise Angular codebases.

## Review Areas

Review the repository in the following dimensions.

### 1. Architecture

Evaluate:

- feature boundaries
- dependency direction
- shared/core boundaries
- public APIs
- circular dependencies
- coupling
- cohesion
- abstraction quality

### 2. Angular Architecture

Evaluate:

- standalone components
- dependency injection
- signals
- reactive patterns
- routing
- guards
- interceptors
- lifecycle management
- template architecture

Identify outdated Angular patterns if any exist.

### 3. State Management

For every important state, identify:

- owner
- lifetime
- source of truth
- synchronization mechanism
- persistence
- reset behavior

Produce a state ownership map.

### 4. API Architecture

Trace:

UI
→ state/application layer
→ API client
→ HTTP
→ backend

Identify:

- inappropriate coupling
- duplicated API logic
- error handling inconsistencies
- type mismatches
- missing cancellation
- missing retry boundaries

### 5. Forms

Review:

- form architecture
- validation
- async validation
- server validation
- dirty state
- reset
- error display
- accessibility

### 6. Performance

Inspect:

- bundle
- lazy loading
- rendering
- unnecessary computation
- unnecessary subscriptions
- request duplication
- caching
- debouncing
- cancellation
- image handling

Do not make performance claims without evidence.

### 7. Security

Review:

- authentication
- authorization
- token handling
- XSS
- CSRF
- CORS
- CSP
- file upload
- sensitive data
- browser security boundaries

Clearly separate frontend responsibility from backend responsibility.

### 8. Accessibility

Review:

- semantic HTML
- keyboard navigation
- focus
- ARIA
- forms
- dialogs
- tables
- notifications
- contrast
- reduced motion

### 9. Testing

Evaluate:

- unit
- component
- integration
- E2E
- accessibility
- visual regression
- mocking
- test data

Identify gaps in the testing pyramid.

### 10. Developer Experience

Review:

- project setup
- scripts
- lint
- formatting
- TypeScript
- CI
- documentation
- local development
- debugging

### 11. Enterprise Maintainability

Look for:

- god components
- god services
- excessive shared state
- excessive abstraction
- duplicated logic
- unclear naming
- hidden side effects
- implicit dependencies
- feature leakage
- technical debt

## Important Constraint

Do not give a generic code review.

For every significant finding provide:

Location
Problem
Why it matters
Concrete example
Suggested improvement
Priority

Do not use arbitrary numeric quality scores.

## Architecture Map

Generate:

1. Feature dependency graph
2. State ownership map
3. Request lifecycle
4. Authentication flow
5. Error flow
6. Main user journeys
7. Testing architecture

## Final Deliverable

Create:

docs/enterprise-review.md

The report should answer:

"If I joined a large Angular enterprise project tomorrow, which concepts from this repository would transfer directly, and which concepts are simplified because this is a learning project?"

Also identify:

- what should remain simple
- what should be more enterprise-like
- what should NOT be copied blindly into a real production project

Do not modify production code unless fixing a clearly identified architectural defect is necessary for the review.

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
- [ ] No production code modified except a clearly identified architectural defect, each justified in the report
- [ ] Every finding has Location, Problem, Why it matters, Concrete example, Suggested improvement, Priority
- [ ] All seven architecture maps are produced
- [ ] `docs/enterprise-review.md` exists and answers the transferability question directly
- [ ] No arbitrary numeric quality scores anywhere in the report
- [ ] The technical-debt register in `docs/PROGRESS.md` is reconciled against what the review actually found
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-8` and tagged
