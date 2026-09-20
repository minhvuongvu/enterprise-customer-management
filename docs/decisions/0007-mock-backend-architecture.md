# ADR-0007 — Mock backend architecture

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0.5

## Problem

The application needs a backend. `ANGULAR_PROJECT_CONTEXT.md` §5.4 already settled that
it must be a real HTTP server rather than an in-app interceptor. What it did not settle
is how that server is built: where its data lives, how it runs, how failures are
produced on demand, and how far the realism goes.

## Options considered

### Where the data lives

**A. A database (SQLite, Postgres in Docker).** Realistic persistence, migrations, SQL.
Adds a service to run, a schema to migrate, and a class of problem — connection pools,
transactions — that is not what this project teaches.
**B. In memory, generated from a seed.** No setup, instant reset, reproducible.
A restart loses everything.

### How it runs

**A. Compile with tsc, run the output.** Conventional; adds a build step and a `dist`
that can be stale.
**B. Run the TypeScript directly.** Node 24 strips types natively, so `node src/main.ts`
works with no build at all.

### How failures are produced

**A. Randomly, at a configurable rate.** Realistic-feeling, and the reason every test
that uses it is flaky.
**B. On request, through a header.** Deterministic; a test asks for the failure it wants.

### How much realism

**A. Simulate the shapes only** — right status codes, right JSON.
**B. Implement the mechanisms** — real cookies, real CSRF, real CORS preflights, real
server-side authorization, real multipart uploads.

## Decision

- Data: **in memory**, generated deterministically from a seed (default 50,000
  customers), with `POST /api/_mock/reseed` to rebuild it.
- Runtime: **run the TypeScript directly** with Node's type stripping. No build step.
- Failures: **`x-mock-scenario` header**, with a published catalogue served from
  `/api/_mock/scenarios`. Random failure exists as an opt-in control, off by default,
  and no test uses it.
- Realism: **implement the mechanisms**, except password verification.

## Reason

The mechanisms are the point. §4.12 forbids claiming that a frontend-only control
provides security, and Phase 3 has to _demonstrate_ the boundary rather than describe
it. That is only possible if `HttpOnly` cookies, `SameSite`, CSRF double-submit, CORS
preflight and server-side permission checks actually exist. They do, and the tests call
the API directly — with no browser and no Angular guard involved — to prove the server
refuses on its own.

Determinism is what makes the failure paths testable. A 3% random error rate produces a
suite that fails once a week for no reason, and a team that reruns instead of reading.
With a header, "what does the UI do on a 409" is a test rather than a discussion.

In-memory data buys a reset between test files and a dataset identical on every machine.
Fifty thousand rows is enough that sorting and filtering cost real milliseconds, which
is what Phase 5 needs in order to measure anything.

**Passwords are the one deliberate gap.** The mock accepts any non-empty password for a
known username. The alternative was to commit a credential to a fixture, and "it is only
a demo password" is exactly how real ones end up in repositories. The cost is that the
wrong-password path is not naturally reachable, so the `invalid-credentials` scenario
provides it — which is arguably better, since it is deterministic.

Running TypeScript directly removes a build step and a category of "did you rebuild?"
confusion. It costs two constraints, both documented in the development guide: Node's
strip-only mode rejects **constructor parameter properties** and **enums**, and requires
literal `.ts` extensions on relative imports.

## Consequences

- A restart resets all data and signs everyone out. Stated in `docs/mock-backend.md`
  rather than discovered.
- `apps/mock-api` has no build output. Its dependency `@ecm/contracts` does — see
  ADR-0008 for why they differ.
- No parameter properties or enums anywhere in `apps/mock-api/src`. Both are flagged by
  a comment where they would have been natural.
- Every scenario is covered by a test. A documented-but-broken scenario is worse than a
  missing one, because a test written against it passes for the wrong reason.
- `/api/_mock/*` is unauthenticated and must never be deployed. It is not described in
  `@ecm/contracts`, so the application literally has no typed way to depend on it.
- Uploads live in memory, so there is no path-traversal surface and no cleanup story —
  and no file survives a restart.

## Revisit when

- Phase 4 or 5 needs data to survive a restart.
- Phase 3 wants to demonstrate password hashing, which would need a credential store
  and a different answer to the fixture problem.
- Node changes what its type stripping supports.
