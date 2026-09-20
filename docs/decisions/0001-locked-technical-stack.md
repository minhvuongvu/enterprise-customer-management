# ADR-0001 — Locked technical stack

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Pre-Phase-0 (planning)

## Problem

The project is implemented across ten phases, each in a separate Claude Code session with no memory of the previous ones. Every session that finds an unmade technology decision will make its own — and they will not agree.

The original plan left these open: unit test runner, E2E tool, whether to use a component library, i18n mechanism, server-state approach, mock-backend mechanism, repository layout, and whether SSR is ever enabled.

Several of these are cross-cutting and cannot be changed later without a repository-wide refactor.

## Options considered

### Option A — Let each phase choose
- Pros: no upfront work; each phase picks what fits.
- Cons: guaranteed inconsistency across sessions; cross-cutting choices (i18n, SSR, mock backend) become refactors when they land late; the Phase 8 review has no baseline to judge against.

### Option B — Lock the stack once, allow change only by superseding ADR
- Pros: every session makes the same choices; cross-cutting seams exist from Phase 0; deviations become visible and deliberate.
- Cons: some decisions are made before the code that would justify them exists.

## Decision

Option B. The stack is recorded in `ANGULAR_PROJECT_CONTEXT.md` §5 and is binding.

Versions verified against the npm registry on 2026-09-20:

| Concern | Choice | Version |
|---|---|---|
| Framework | Angular standalone + signals | 22.1.7 |
| Language | TypeScript strict | 6.0.3 |
| Unit/component tests | Vitest via `@angular/build` | 4.1.11 |
| E2E | Playwright | 1.63.0 |
| A11y testing | `@axe-core/playwright` | 4.13.0 |
| Lint | ESLint + angular-eslint | 10.11.0 / 22.5.0 |
| Format | Prettier | 3.9.8 |
| UI | hand-written components on Angular CDK | 22.1.7 |
| i18n | Transloco | 8.4.0 |
| Contracts | Zod | 4.6.5 |
| Mock backend | Express | 5.2.1 |
| Monorepo | npm workspaces | npm 11.x |
| Server state | no store library — per-feature signal store + explicit cache | — |

## Reason

Three constraints did most of the work:

1. **Compatibility is not negotiable.** Angular 22 requires TypeScript `>=6.0 <6.1` and `@angular/build` peer-requires `vitest ^4.0.8`. The *latest* TypeScript (7.0.2) and *latest* Vitest (5.0.1) are both incompatible. "Use the latest" would have failed at install.
2. **Some requirements cannot be honestly met by a frontend-only mock.** HttpOnly cookies, CSRF, CORS, CSP, server-side authorization, upload progress and WebSocket/SSE all need a real HTTP server. §4.12 forbids claiming a frontend mechanism provides backend security, so the mock backend must be a real Express process.
3. **Runtime language switching rules out `@angular/localize`**, which is build-time-per-locale. Transloco is the choice that satisfies the stated requirement.

CDK rather than a full component library: the learning objective is composition and accessibility, and hand-writing focus traps and overlay positioning reliably produces subtly broken behaviour that Phase 6 then has to fix. CDK removes that failure mode while leaving component composition to be written by hand.

No store library initially: §4.5 requires explicit state ownership and warns against globalising everything. A hand-written per-feature signal store makes ownership visible. This is revisited once, at Phase 4.

## Consequences

- Phase 0 cannot start on Node v20.18.0; the runtime must be upgraded first.
- Phase 0 grows: it now also scaffolds SSR and creates the cross-cutting seams.
- A new Phase 0.5 exists for the mock API and contracts package.
- Phase 5 measures rendering modes instead of introducing SSR.
- Phase 6's i18n work becomes filling in a seam rather than bulk string extraction.
- Any phase that wants a different choice must write a superseding ADR and say what broke.

## Revisit when

- An Angular upgrade changes the TypeScript or Vitest compatibility range.
- Phase 4 shows the hand-written cache cannot express realtime invalidation plus optimistic rollback.
- SSR in development proves disruptive enough to outweigh the platform-safety benefit (Phase 1).
