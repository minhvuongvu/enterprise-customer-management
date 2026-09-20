Continue working on the existing Angular enterprise learning repository.

This is Phase 0.5.

## Why this phase exists

Phases 2, 3, 4 and 5 depend on backend behaviour that a frontend-only mock cannot provide:

- HttpOnly cookies, SameSite, CSRF — Phase 3
- real CORS preflight and security headers — Phase 3
- server-side authorization enforcement — Phase 3
- real upload progress and multipart handling — Phase 4
- WebSocket / SSE — Phase 4
- large-dataset latency and pagination cost — Phase 5

`ANGULAR_PROJECT_CONTEXT.md` §4.12 forbids claiming that a frontend mechanism provides backend security. A mock implemented as an Angular interceptor would force Phase 3 to *describe* security it does not have.

Therefore the mock backend is a real Express process, built before the Customer feature.

## Objective

Establish the workspace layout, the shared API contract, and a realistic mock backend.

Do NOT implement any Angular Customer UI in this phase.

## 1. Workspace layout — verify and extend

Phase 0 created the workspace root and `apps/web`. Add the two remaining packages per §5.3:

apps/mock-api/
packages/contracts/

Requirements:

- one install at the root
- `packages/contracts` consumed by both apps as a workspace dependency
- `packages/contracts` must never import from `apps/*`
- root scripts can run web, api, or both together
- TypeScript project references or path mapping — whichever is simpler to understand

Do not introduce Nx or a build orchestrator.

## 2. packages/contracts

This package is the single source of truth for the API shape.

Define with Zod:

- `Customer` and its enums (`status`, `gender`)
- create / update payloads
- list query parameters
- paginated list response
- error response envelope
- auth: login payload, session/current-user response
- audit entry
- import result, export request

Derive TypeScript types from the schemas. Do not hand-write a second copy of the types.

Also export shared deterministic fixtures:

- the fixed user set — used by auth, `createdBy`/`updatedBy`, and audit `actor`. One user list, not three.
- the role/permission matrix of §3.2

Document the versioning rule: what happens when a field changes, and how both sides stay in sync.

## 3. apps/mock-api

A real Express server.

### Endpoints

Customers:

- list — pagination, sorting, keyword search, status filter, gender filter, date-range filter
- get by id
- create
- update
- delete
- bulk activate / deactivate / delete, with per-item results
- audit entries for a customer

Auth:

- login
- logout
- current user
- token refresh

Files:

- avatar upload (multipart, real progress)
- CSV import
- export

Realtime:

- one SSE or WebSocket endpoint emitting customer-changed and system events

### Behaviour requirements

- validate every request body against the contracts schemas and return field-level errors
- enforce roles and permissions **server-side** — the frontend is not the boundary
- return correct status codes: 400, 401, 403, 404, 409, 422, 429, 500
- `409 Conflict` on stale writes — implement optimistic concurrency with a version or `updatedAt` precondition, because Phase 4 needs a real conflict
- configurable artificial latency
- deterministic behaviour when a fixed seed is used

### Fault injection

Provide explicit, controllable failure — not random failure that makes tests flaky.

- a request header (for example `x-mock-scenario`) selecting a scenario: slow, 500, network drop, conflict, partial bulk failure, expired session
- a small admin endpoint or config file for global settings: latency, error rate, dataset size
- tests must be able to request a scenario deterministically

### Seed data

- generate a realistic customer set at a scale that makes Phase 5 measurable — on the order of 50,000 rows
- deterministic from a seed so tests and screenshots are reproducible
- realistic distribution: not every field populated, some duplicates, a mix of statuses, some awkward names and non-ASCII values
- all instants stored as UTC ISO-8601; `dateOfBirth` is date-only

### Security surface

Implement what Phase 3 will later rely on, and document ownership:

- session cookie: HttpOnly, SameSite, Secure in non-dev
- CSRF double-submit token
- explicit CORS configuration, not a wildcard
- security headers including a CSP
- upload validation: extension, MIME sniffing, size limit
- never log tokens, passwords or full personal records

## 4. Wiring into the Angular app

Minimal only:

- dev proxy configuration so the app calls the API on one origin
- the HTTP layer from Phase 0 pointed at the mock API
- one trivial end-to-end call proving the wiring works

Do not build the Customer feature. Do not build the auth feature.

## 5. Documentation

Create:

docs/api-contract.md
docs/mock-backend.md

Document:

- the endpoint list and semantics
- the error envelope and status-code meaning
- the fault-injection interface and every scenario
- the seeding strategy and how to reproduce a dataset
- optimistic concurrency behaviour
- which security controls live in the mock API, and which would be a reverse proxy's or a real backend's job in production

Write an ADR for the mock-backend architecture.

## 6. Testing

- contract schema tests
- API integration tests against the running server, covering each status code
- a deterministic-seed test proving reproducibility
- fault-injection tests

## Workflow

1. Inspect the repository and `docs/PROGRESS.md`.
2. Confirm the Phase 0 foundation and what it actually produced.
3. Produce a short plan.
4. Implement.
5. Run all checks.

Report files created, decisions, test results, and known limitations.

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
- [ ] `packages/contracts` is the only definition of API types — no hand-written duplicate types anywhere
- [ ] `packages/contracts` imports nothing from `apps/*`
- [ ] The mock API enforces roles and permissions server-side, independently of any frontend check
- [ ] Every status code in the list (400/401/403/404/409/422/429/500) is reachable and covered by a test
- [ ] Optimistic concurrency returns a real `409` on a stale write
- [ ] A fixed seed reproduces an identical dataset — proven by a test
- [ ] Every fault-injection scenario is documented and deterministically selectable
- [ ] One shared user fixture serves auth, `createdBy`/`updatedBy` and audit `actor`
- [ ] The dev proxy works and one real end-to-end call from `apps/web` succeeds
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-0.5` and tagged
