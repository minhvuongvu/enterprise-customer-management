# ADR-0008 — The contracts package is compiled; the apps are not

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0.5

## Problem

`packages/contracts` is imported by two consumers with incompatible requirements, and
the conflict is not obvious until it fails.

- **Node** (ADR-0007) runs TypeScript by stripping types. It does no module resolution
  rewriting, so a relative import must name the file that exists: `./primitives.ts`.
  Verified: both `./primitives` and `./primitives.js` fail with `ERR_MODULE_NOT_FOUND`.
- **TypeScript** permits `.ts` in an import specifier only under
  `allowImportingTsExtensions`, which in turn requires `noEmit`. The Angular build
  emits. Verified: `error TS5097`.

So the contracts source cannot use `.ts` specifiers and be compiled by Angular, and
cannot omit them and be run by Node. Something has to give.

## Options considered

### A. Put the whole contract in one file

No relative imports, so no specifier problem at all. Works everywhere, needs no build.
Costs the module structure — roughly 600 lines in one file, in a repository whose
subject is how to organise code.

### B. Give Angular a path mapping to the source, keep `.ts` specifiers

This is what was tried first. It fails: the mapping resolves, and then the Angular
compiler rejects the `.ts` specifiers inside the package for the reason above.

### C. Compile the contracts package; consumers use the build output

Source uses `.js` specifiers — the TypeScript ESM convention — and `tsc` emits real
`.js` and `.d.ts` files. Node resolves the emitted `.js` with no rewriting. Angular
consumes the declarations like any other dependency.

Costs a build step, and an ordering requirement: contracts must be built before anything
that depends on it is typechecked, tested or built.

### D. Compile everything, including the apps

Uniform, and throws away the no-build simplicity that makes the mock API pleasant to
work on, for no gain in the apps.

## Decision

Option C.

`packages/contracts` is a **library**: it has a build (`tsc -p tsconfig.json` → `dist/`),
and its `exports` point at `dist/index.js` and `dist/index.d.ts`.

`apps/mock-api` is an **application**: it runs from source, with no build.

The root scripts run `build:contracts` before `typecheck`, `test`, `build` and `e2e`,
because npm gives no ordering guarantee across workspaces — and `apps/*` sorts before
`packages/*`, so the naive order is exactly the wrong one.

## Reason

The library/application split is not a workaround, it is the honest description. A
library is consumed by others and therefore ships a compiled surface with declarations;
an application is the leaf and can run however it likes. Framing it that way also means
the contract tests import `@ecm/contracts` by name and run against the artifact everyone
else consumes, rather than against source that might compile differently.

Option A was tempting — it genuinely removes the problem — but a contracts package is
exactly where a reader looks to see how a shared API definition is organised, and
answering "one big file, because of a module-resolution conflict" teaches the wrong
thing.

## Consequences

- Editing contracts requires a rebuild before the change is visible to the apps.
  `npm run watch --workspace @ecm/contracts` covers the inner loop, and the root scripts
  cover everything else.
- `packages/contracts/dist` is generated and git-ignored.
- Contracts source uses `.js` specifiers that resolve to `.ts` files. That looks wrong
  the first time it is read; it is the documented TypeScript ESM convention, and the
  reason is here.
- A fresh clone must run `npm install` and then a build before `apps/web` will
  typecheck. The root scripts do this; a bare `tsc` inside `apps/web` will not.

## Revisit when

- Node's type stripping gains specifier rewriting, which would remove the conflict
  entirely.
- The contracts package grows consumers with different needs — a published package, a
  second language — that make a build step insufficient rather than merely necessary.
