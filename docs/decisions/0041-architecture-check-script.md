# ADR-0041 — A repository architecture check: cycles and forbidden imports

**Status:** Accepted
**Date:** 2026-09-30
**Phase:** Phase 7

## Problem

Dependency direction was enforced by review (debt row 2): the layer rules in CLAUDE.md
and docs/architecture.md, and "no import cycles", checked by a throwaway script at the
end of each phase. Phase 7 requires an architecture check that runs in CI and fails on a
cycle or a forbidden import.

## Options considered

### Option A — dependency-cruiser

- Pros: mature, graph output, many rule types.
- Cons: a dependency with its own configuration language, for a dozen rules.

### Option B — eslint-plugin-boundaries / `no-restricted-imports`

- Pros: in the editor.
- Cons: no cycle detection across files without `import/no-cycle`, which is slow and
  another plugin; path patterns get unreadable for "a feature only through its entry".

### Option C — `lint/architecture.ts`: TypeScript's parser, rules as data

- Pros: one dependency the repository already has; each rule is a named function with
  its reason printed on failure; cycles by Tarjan's algorithm; a `--graph` mode that
  prints the real layer graph for the docs; its own tests (`lint/architecture.test.ts`).
- Cons: not in the editor; ours to maintain.

## Decision

Option C, as `npm run lint:architecture`, part of `npm run lint` and CI's `quality` job.
Twelve checks: no import cycles (type-only edges included, lazy `import()` excluded), and
eleven rules - contracts depend on nothing; the apps never import each other; contracts
only through their package entries (`@ecm/contracts/testing` from tests only); core
depends only on core; shared/ui is a leaf (formatting through `core/i18n` allowed); layout
knows no feature; features are isolated; the root reaches a feature only through its
declared entry points; test code stays in tests; no Node in browser code; no dumping-ground
folders.

## Reason

The rules are the architecture; keeping them as a short list of data with reasons makes
them documentation that executes. Parsing with the compiler (not a regex) means an
`import(...)` in a comment is not an edge.

## Consequences

- Its first run found one real violation (the root importing the labs' guard) and no
  cycles - 332 files, 912 internal imports.
- Debt row 2 is paid.
- A new feature adds itself to `FEATURES` and `FEATURE_ENTRY_POINTS`.

## Revisit when

The rule set outgrows a readable list, or editor feedback becomes worth a plugin.
