# ADR-0044 — The SSR server caches only fingerprinted files; everything else is revalidated

**Status:** Accepted
**Date:** 2026-10-02
**Phase:** Phase 8

## Problem

`server.ts`, as scaffolded by the Angular CLI, served every static file with
`Cache-Control: public, max-age=31536000`. That includes files whose name survives a
deployment: `config.json`, `ngsw.json`, `ngsw-worker.js`, `favicon.ico`. A browser that
had loaded the application once kept its `config.json` for a year, so ADR-0005 (one
artifact, configured per deployment) and ADR-0040 (runtime flags, the `customerImport`
kill switch) did not reach returning users. The service worker's `freshness` strategy
does not help: its network request goes through the same HTTP cache. Found by the
Phase 8 review with `curl` (docs/enterprise-review.md D2).

## Options considered

### Option A — exempt the known mutable files

- Pros: a short list.
- Cons: a deny-list - the next mutable file (a manifest, a second config) is cached for
  a year by default.

### Option B — cache only fingerprinted files; `no-cache` for everything else

- Pros: an allow-list - safe by default. `no-cache` still caches and revalidates with
  the ETag (a 304), so the cost is a round trip, not a download.
- Cons: depends on the build's file naming (`main-<hash>.js`, `chunk-<hash>.js`,
  `styles-<hash>.css`); a builder that changes it would make bundles revalidate - slower,
  never stale.

### Option C — leave it to a CDN or reverse proxy

- Pros: where caching belongs in a real deployment.
- Cons: there is no deployment; and the application server's defaults are what a proxy
  passes through unless configured otherwise.

## Decision

Option B, in `server.ts`: `public, max-age=31536000, immutable` for
`(main|chunk|polyfills|styles|worker)-<hash>.(js|css)`, `no-cache` for every other file.
`e2e-production/production.spec.ts` ("HTTP caching") asserts both.

## Reason

The failure mode of B is a slower load; the failure mode of A is a configuration change
that silently never arrives. For a mechanism documented as a kill switch, only B is
acceptable.

## Consequences

- A `config.json` change reaches every browser on its next load.
- Lab images under `labs/` are revalidated too (they are not fingerprinted); acceptable.
- A real deployment's proxy or CDN should keep the same split; docs/configuration.md says
  so.

## Revisit when

A CDN or proxy takes over caching, or the build's output naming changes.
