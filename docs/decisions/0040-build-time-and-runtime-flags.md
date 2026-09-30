# ADR-0040 — Runtime flags from config.json; build-time flags by file replacement

**Status:** Accepted
**Date:** 2026-09-30
**Phase:** Phase 7

## Problem

Phase 0 left a seam: `FeatureFlags.isEnabled` for runtime flags from `config.json`, and
an unused `buildFlags.enableDevTools`. Phase 7 asks for both kinds, working, with
guidance on which to use - and a proof that a disabled build-time flag removes its code.

## Options considered

### Option A — build-time flags read in an `if`

`if (environment.buildFlags.enableDevTools) { providers.push(MemoryLogSink) }`

- Pros: one line; readable.
- Cons: **does not work**, measured. `perf/check-budgets.ts` found `memory-log-sink.ts` in
  the production `main` bundle: esbuild does not fold a property of an imported object,
  and a top-level `const` did not help either - the compiled class carries static
  initialisers (`ɵfac`, `ɵprov`), and a bundler keeps a class with those even when
  nothing reads it.

### Option B — build-time flags by `fileReplacements`

A `dev-tools.providers.ts` that registers the tooling, replaced in production by a
`.production.ts` twin that registers nothing.

- Pros: the import disappears, so the class disappears - verified by the budget check.
- Cons: two files per flag; the flag's value is recorded in `environment.buildFlags` but
  applied by angular.json.

### Option C — a flag service with remote evaluation

- Cons: a platform, for three flags.

## Decision

Runtime flags: `config.json` → `AppConfig.features`, validated by a strict Zod schema
(the whole file rejected, with the reason logged, if any key is wrong or misspelt), read
through `FeatureFlags.isEnabled` or on routes with `featureEnabled(flag)` (`CanMatch`).
A new one, `customerImport`, is a kill switch for bulk import.

Build-time flags: Option B. `enableDevTools` (the in-memory log sink and the
observability lab's live log) is the one there is. `perf/budgets.json`
`neverInProduction` lists the file, so a flag that stops removing its code fails CI.

The rule: **a runtime flag for a decision, a build-time flag for code that must not
ship** (docs/feature-flags.md).

## Reason

Runtime flags preserve the one property that matters for releases - one artifact
promoted from staging to production. Build-time flags exist only to keep code out of a
bundle, so the mechanism must be the one that actually does, and a check must prove it.

## Consequences

- `technical-labs.guard.ts` is gone; `featureEnabled('technicalLabs')` in `core/config`
  replaced it - which also removed the one import from the root into a feature's
  internals that the new architecture check reported.
- A switched-off `/customers/import` falls through to `/customers/:id`, which answers "no
  such customer": absent, not refused.
- Every deployment file names every flag (`deploy-configs.spec.ts`).

## Revisit when

A flag needs per-user targeting or live changes: `FeatureFlags` becomes the adapter to a
flag service; call sites stay.
