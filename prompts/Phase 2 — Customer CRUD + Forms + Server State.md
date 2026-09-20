Continue working on the existing Angular enterprise learning repository.

This is Phase 2.

## Objective

Implement the Customer Management business feature with realistic enterprise CRUD behavior.

The business scope is intentionally small. The implementation quality and architecture are the primary learning objectives.

## Customer Model

Use a model similar to:

Customer:

- id
- customerCode
- fullName
- email
- phone
- dateOfBirth
- gender
- status
- address
- avatar
- tags
- createdAt
- updatedAt
- createdBy
- updatedBy

Adjust fields if required by the architecture.

## Required Features

### Customer List

Implement:

- server-side pagination
- sorting
- keyword search
- filtering
- status filter
- gender filter
- date range filter
- reset filters
- refresh
- loading state
- empty state
- error state
- selection
- bulk selection

URL must represent relevant list state.

Example:

/customers?page=2&size=20&search=john&status=ACTIVE&sort=updatedAt,desc

Do not keep navigational/filter state only in component memory.

### Customer Detail

Implement:

/customers/:id

Support:

- loading
- success
- not found
- API error
- refresh
- navigation back
- edit
- delete

### Create

Implement:

/customers/new

Use a reactive form architecture.

Include:

- required validation
- format validation
- length validation
- cross-field validation
- async validation where meaningful
- server validation
- inline error display
- submit state
- reset
- cancel

### Edit

Implement:

/customers/:id/edit

Support:

- initial data loading
- dirty state
- reset
- save
- server validation errors
- unsaved changes protection

### Delete

Implement:

- confirmation dialog
- API request
- loading state
- success feedback
- failure feedback
- list refresh/update

### Bulk Operations

Implement at least:

- bulk activate
- bulk deactivate
- bulk delete

Handle partial failure explicitly.

## API Architecture

Do not call HttpClient directly from presentation components.

Use a clear separation between:

Presentation
Application/state
API/infrastructure

Do not create unnecessary layers.

## Mock Backend

If no backend exists, create a realistic mock API.

The mock API must support:

- latency
- pagination
- sorting
- filtering
- search
- validation errors
- 404
- 401/403
- 409 conflict
- 500
- network failure simulation

The frontend must behave as if it were communicating with a real backend.

Do not hard-code fake responses directly into components.

## State Architecture

Explicitly distinguish:

- local UI state
- form state
- URL state
- server state
- shared application state
- derived state

Use Angular signals where appropriate.

Avoid introducing a global store for state that can remain local to the feature.

Document why each state belongs where it does.

## HTTP

Implement:

- GET
- POST
- PATCH/PUT
- DELETE
- query parameters
- path parameters
- headers
- timeout
- retry where appropriate
- request cancellation
- centralized error mapping

Search requests must demonstrate debouncing and cancellation.

## UX States

Every API-driven feature should explicitly handle:

idle
loading
refreshing
success
empty
error

Avoid boolean flags such as:

isLoading
isError
isEmpty
unless there is a clear reason.

Prefer an explicit state model where appropriate.

## Testing

Add:

- API service tests
- state/store tests
- form validation tests
- component tests
- integration tests
- CRUD E2E flow

At minimum the E2E test should cover:

Login placeholder
→ Customer List
→ Search
→ Detail
→ Edit
→ Save
→ Delete

## Documentation

Document:

- Customer feature architecture
- state ownership
- API flow
- form architecture
- error handling
- URL state design

## Workflow

Before coding:

1. Inspect repository.
2. Review existing architecture.
3. Identify reuse opportunities.
4. Design Customer feature.
5. Explain important trade-offs.
6. Then implement.

After coding:

- format
- lint
- typecheck
- unit tests
- integration tests
- E2E tests
- inspect bundle/build
- review architecture

Do not refactor unrelated code.

Report:

- implementation summary
- architecture
- important decisions
- tests
- known limitations
- next phase

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
- [ ] The URL is the source of truth for list state — reload, back/forward and deep link all restore it
- [ ] No `HttpClient` usage in any component
- [ ] Search debounces and cancels in-flight requests — proven by test
- [ ] Every API-driven surface handles idle, loading, refreshing, success, empty and error explicitly
- [ ] Bulk operations report partial failure per item, not as one success or one failure
- [ ] The `409` conflict path is reachable and handled
- [ ] Every API response is validated against the contracts schema at the boundary
- [ ] State ownership is documented for each piece of state: owner, lifetime, source of truth, reset behaviour
- [ ] Cache invalidation rules are written down — each mutation states what it invalidates
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-2` and tagged
