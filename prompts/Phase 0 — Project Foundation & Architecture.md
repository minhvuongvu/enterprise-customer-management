You are working as a senior Angular enterprise architect and developer.

## Project Goal

Build a production-oriented Angular application for learning and researching real-world enterprise Angular codebases.

The application is a Customer Management system. The business domain is intentionally small, but the technical architecture must be designed so that the repository can evolve into a large enterprise frontend.

The project will be implemented incrementally through multiple phases. This is Phase 0.

## Phase 0 Objective

Establish the project foundation, architecture, developer experience, coding standards, dependency boundaries, and the cross-cutting seams that cannot be retrofitted cheaply.

Do NOT implement the complete Customer Management functionality yet.

## Step 0 — Verify the runtime before anything else

Run `node -v`.

Angular 22 requires `^22.22.3 || ^24.15.0 || >=26.0.0`.

If the runtime is too old, stop and report it. Do not downgrade Angular to fit an old Node. Update the environment table in `docs/PROGRESS.md` with what you found.

## Technology Direction

The stack is already decided. Read `ANGULAR_PROJECT_CONTEXT.md` §5 — Locked Technical Decisions — and `docs/decisions/0001-locked-technical-stack.md` before installing anything.

Do not substitute "the latest version" for a locked version. The latest TypeScript and the latest Vitest are both incompatible with Angular 22; that is precisely why the versions are pinned.

Re-verify each locked version resolves at install time and record what actually installed in ADR-0001.

Within that stack, prefer modern Angular patterns:

- Standalone APIs and standalone components
- Functional providers
- Functional route guards and interceptors
- Signals for local/reactive UI state
- Strict TypeScript, including `strictTemplates`
- Modern Angular template syntax
- Lazy-loaded routes
- Dependency Injection

Do not introduce deprecated Angular patterns unless there is a specific technical reason.

## Repository layout

Create the workspace root and the web application in their final position per §5.3:

apps/web/

`apps/mock-api/` and `packages/contracts/` arrive in Phase 0.5 — set the workspace up so they can be added without moving anything.

## Architecture Principles

Use feature-oriented architecture rather than generic folders such as:

components/
services/
utils/
models/

Prefer boundaries such as:

apps/web/src/app/
core/
shared/
customers/
notifications/
technical-labs/

The exact structure may be adjusted if you find a better enterprise-oriented structure.

Establish clear dependency direction.

A feature must not directly depend on another feature's internal implementation.

Prefer public APIs for cross-feature communication.

Avoid circular dependencies.

Avoid premature abstraction. Every abstraction must have a clear reason.

## Required Foundation

Set up:

1. Angular application, **scaffolded with SSR enabled** (see §5.6 — SSR is configured now so it never becomes a retrofit; the authenticated app still renders client-side)
2. TypeScript strict mode and `strictTemplates`
3. ESLint
4. Prettier
5. Unit/component testing — Vitest via the Angular builder
6. E2E testing infrastructure — Playwright
7. Environment configuration
8. Runtime configuration architecture
9. Global error handling foundation
10. HTTP infrastructure foundation
11. Application routing foundation
12. Shared UI foundation
13. CI-friendly npm scripts
14. Basic README
15. Architecture documentation

## Cross-cutting seams

These concerns do not retrofit cheaply. Phase 0 creates the seam; a later phase fills it in.

A seam is a few dozen lines. It must not turn into an implementation of the later phase.

| Seam | Build now | Filled in |
|---|---|---|
| i18n | Transloco wired up with `en` only, translation pipe/service in place. **No hardcoded user-facing string may be written from this point on** | Phase 6 |
| Logging / observability | `Logger` abstraction, and a correlation ID generated per request in the HTTP layer | Phase 7 |
| Platform safety | injection tokens for `window`, `document` and storage; application code never touches browser globals directly | Phase 5/6 |
| Error handling | the §4.7 taxonomy as a real discriminated union, plus central HTTP error mapping | every phase |
| Auth | `SessionService` skeleton and an `authGuard` that currently returns `true`, already wired into the route tree | Phase 3 |
| Feature flags | minimal flag service reading runtime configuration | Phase 7 |
| Time & timezone | the policy encoded once: UTC ISO-8601 in transport and storage, formatted only at render; `dateOfBirth` is date-only and never timezone-shifted | Phase 6 |

Add lint rules that enforce the two rules people break silently: no hardcoded user-facing strings, and no direct browser globals in application code.

## Required Documentation

Create:

docs/
architecture.md
development-guide.md
testing-strategy.md
decisions/

Document:

- architecture overview
- dependency direction
- feature boundaries
- state management strategy
- API strategy
- testing strategy
- configuration strategy
- naming conventions
- when to create a shared component
- when NOT to create an abstraction

Use ADRs for important architectural decisions.

## Important Constraint

Do not overengineer.

This repository is both:

1. a working application
2. a learning/research repository

The architecture must therefore be understandable by a developer studying the code.

Prefer explicit code over clever abstractions.

## Required Workflow

Before modifying files:

1. Verify the Node runtime.
2. Read `docs/PROGRESS.md`.
3. Read `ANGULAR_PROJECT_CONTEXT.md` §5 and ADR-0001.
4. Inspect the existing repository.
5. Produce a short implementation plan.

Then implement the plan.

## Definition of Done

Do not report this phase as complete until every item holds. Report any failing item as failing, with output.

- [ ] Node runtime verified; `docs/PROGRESS.md` environment table updated
- [ ] Locked versions installed as specified; actual resolved versions recorded in ADR-0001
- [ ] `npm run format` clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` clean under `strict` + `strictTemplates`
- [ ] `npm run test` passing, with meaningful assertions
- [ ] `npm run build` succeeds, **including the server build**
- [ ] `npm run e2e` smoke test passing
- [ ] All seven cross-cutting seams exist and are wired in
- [ ] Lint enforces: no hardcoded user-facing strings, no direct browser globals
- [ ] `apps/web` sits in its final workspace position
- [ ] No circular dependencies
- [ ] `docs/architecture.md`, `development-guide.md`, `testing-strategy.md` written
- [ ] ADRs written for significant decisions
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt / next
- [ ] Committed on branch `phase-0` and tagged

## Deliverable

At the end, report:

- files created
- files modified
- architectural decisions
- commands executed
- test results
- known limitations
- recommended next phase

Do not implement features belonging to later phases.
