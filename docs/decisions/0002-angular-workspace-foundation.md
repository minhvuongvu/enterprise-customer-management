# ADR-0002 — Angular workspace foundation

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0

## Problem

Phase 0 has to turn the locked stack (ADR-0001) into an actual workspace. Several
choices are not settled by the lock and would otherwise be re-decided, differently,
by each later phase:

- where the Angular application sits relative to the packages Phase 0.5 adds;
- whether the application uses zone.js or zoneless change detection;
- what "typecheck" means, given that `tsc` does not check Angular templates;
- whether strictness is left to defaults or stated explicitly.

## Options considered

### Workspace layout

**A. One Angular workspace at the repository root**, with `apps/mock-api` and
`packages/contracts` bolted on later.
Pros: the shortest path today.
Cons: npm workspaces needs a `package.json` per package; the Angular workspace root
would also be the monorepo root, so the app's dependencies and the repository's
tooling end up in one file. Phase 0.5 would have to move things.

**B. npm workspace root + a self-contained Angular workspace at `apps/web`.**
Pros: matches the locked layout exactly; `apps/mock-api` and `packages/contracts`
drop in without moving anything; each package declares its own dependencies.
Cons: two `package.json` files to understand instead of one.

### Change detection

**A. zone.js.** Familiar, and every tutorial assumes it.
**B. Zoneless.** Angular 22 no longer installs zone.js in a new application at all;
change detection is driven by signals.

### Typecheck

**A. `tsc --noEmit`.** Fast, but blind to templates — `strictTemplates` errors only
surface during `ng build`.
**B. `ngc --noEmit`.** The Angular compiler, so templates are checked, without
producing a bundle.

## Decision

- Layout **B**: npm workspace root, Angular application at `apps/web`.
- Change detection **B**: zoneless.
- Typecheck **B**: `npm run typecheck` runs `ngc -p tsconfig.app.json --noEmit` and
  the same for the spec project.
- `strict` and `strictTemplates` are written into `tsconfig.json` explicitly even
  though both are already the default.

## Reason

The layout follows from ADR-0001 rather than being a fresh decision: the mock API
must be a real server, so there will be three packages, and it is cheaper to place
the first one correctly than to move it in Phase 0.5.

Zoneless is what Angular 22 generates by default, and it is the change-detection
model that matches this project's emphasis on signals and explicit state ownership.
It also removes zone.js's monkey-patching of browser globals, which sits badly next
to a repository that forbids touching those globals directly.

`ngc` for typechecking matters more than it looks. The Definition of Done claims
"clean under `strict` and `strictTemplates`". With `tsc` that claim would be false:
a template type error would pass `npm run typecheck` and only fail later. Verified
during Phase 0 with a deliberate binding error — `tsc` was silent, `ngc` reported it.

Explicit strictness is a documentation decision, not a technical one. TypeScript 6
turns `strict` on by default and Angular 22 turns `strictTemplates` on by default —
both were confirmed empirically rather than assumed. But this repository is read as
a learning artifact, and the two settings it most depends on should not be invisible.
Writing them down also means a future default change cannot silently relax them.

## Consequences

- Two `package.json` files: the root owns repository tooling (Prettier, Playwright,
  the `verify` script), `apps/web` owns the application's dependencies.
- E2E tests live at the root, because from Phase 0.5 a journey spans app and API.
- Any library added later must work without zone.js. This is worth checking before
  adopting one, not after.
- `npm run typecheck` is slower than `tsc` would be, because it runs the Angular
  compiler. That is the price of the check being true.

## Revisit when

- A dependency that Phase 2–4 genuinely needs turns out to require zone.js.
- Angular ships a first-party template-checking command, making the `ngc` invocation
  unnecessary.
