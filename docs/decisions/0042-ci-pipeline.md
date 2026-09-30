# ADR-0042 — CI: GitHub Actions, browser jobs in the Playwright image, visual baselines made there

**Status:** Accepted
**Date:** 2026-09-30
**Phase:** Phase 7

## Problem

There was no CI. `npm run verify` ran everything on a developer's machine, when someone
remembered. Phase 7 requires a pipeline - install, lint, typecheck, unit, build, E2E,
accessibility, optional bundle analysis - that fails on quality violations, enforces
performance budgets, and runs the Firefox and WebKit tests Phase 6 could not (debt 28).
Visual regression adds a constraint: screenshots differ between machines.

## Options considered

### Option A — one job running `npm run verify`

- Pros: identical to local.
- Cons: 25+ minutes serial; one red step hides which gate failed.

### Option B — parallel jobs on the runner, browsers installed per run

- Pros: fast feedback per gate.
- Cons: `playwright install --with-deps` each run; visual baselines depend on the
  runner image's fonts, which GitHub updates without notice.

### Option C — parallel jobs; browser jobs in `mcr.microsoft.com/playwright:<version>`

- Pros: browsers and fonts pinned to the Playwright version; the same image runs
  locally (`npm run e2e:visual`), so baselines can be made anywhere Docker runs.
- Cons: a 1 GB image pull per browser job (cached by the runner after the first).

## Decision

Option C (`.github/workflows/ci.yml`): `quality` → `unit` and `build` in parallel → `e2e`
(two shards), `accessibility`, `visual`, `e2e-production` → `cross-browser`. Visual
baselines are generated and compared only inside the image; the config refuses to run
elsewhere. No secrets; read-only token; superseded runs cancelled.

## Reason

Each gate is its own job, so a red check names the gate. Pinning the browser environment
to the Playwright version is what makes visual regression stable enough to block a merge.

## Consequences

- The Playwright image tag must be bumped with `@playwright/test`.
- Branch protection (making the checks _required_) is a repository setting and cannot be
  committed; docs/ci.md lists the checks to require.
- Three cross-browser tests are skipped in engines where Playwright cannot set the
  precondition (clipboard permissions outside Chromium; refusing a geolocation prompt in
  headless Firefox), and one is asserted to fail in WebKit (debt row 34) - each with its
  reason in the test.

## Revisit when

The E2E suite passes ~20 minutes per shard (add shards), or the repository moves off
GitHub.
