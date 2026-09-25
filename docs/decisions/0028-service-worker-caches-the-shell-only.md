# ADR-0028 — Angular's service worker caches the application shell, never API data

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

The offline requirement - detection, offline UI, cached read-only data,
reconnect detection - needs the application to _start_ without a network
before any of it can show. Something must cache the JavaScript, styles and
index document. And a service worker, once installed, sits in front of every
request the origin makes, so what it caches is a security decision, not a
performance one.

## Options considered

### A — A hand-written service worker

- Pros: every line visible.
- Cons: versioning, atomic updates and hash-checked assets are exactly the
  parts that go wrong, and a broken service worker serves a stale application
  to every user until it is unregistered.

### B — `@angular/service-worker`, caching the shell and API reads

- Cons: authenticated API responses would be written to the Cache Storage of
  whoever used the browser, outliving sign-out; and a cached `GET /customers`
  is a second, unaudited copy of personal data.

### C — `@angular/service-worker`, caching the shell only (chosen)

## Decision

`ngsw-config.json`:

- `app-shell` (prefetch): `index.csr.html`, the JavaScript and CSS bundles;
- `lab-assets` (lazy): the performance lab's images;
- `runtime-config` (freshness, 3 s timeout): `/config.json`, so an offline
  start uses the last configuration instead of the defaults;
- `navigationRequestStrategy: freshness`: navigations go to the network first,
  so the prerendered and server-rendered pages are still served while online,
  and the cached shell only when the network fails;
- **no `dataGroups` for `/api`**. The one piece of offline data is an explicit,
  user-scoped IndexedDB copy in the offline lab (ADR-0029).

Registered by `provideServiceWorker` in production builds only, when the
application is stable (or after 30 s).

## Reason

Option C gets the property that matters - the application starts offline -
from a maintained implementation with hashed, atomically-updated assets, and
keeps the rule that personal data is stored only where a piece of code
decided to store it and can delete it.

## Consequences

- `provideServiceWorker` adds 6.1 kB to the initial bundle (ADR-0025).
- Under `ng serve` there is no service worker; the production suite
  (`e2e-production/`) tests it against the real build: offline start, and no
  `/api` URL in any cache.
- A deployment must serve `ngsw-worker.js` and `ngsw.json` with `no-cache`, or
  updates stall.
- Offline, pages the user never opened still fail - their lazy chunks are
  prefetched, but their data is not.

## Revisit when

- A real offline requirement arrives for a workflow (not a lab): it needs its
  own ADR, with a consistency model for writes.
