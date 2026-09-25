# ADR-0029 — Offline is one read-only, user-scoped snapshot, plus honest connectivity UI

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Phase 5 asks for a _limited_ offline scenario: detection, offline UI, cached
read-only data, reconnect detection - and forbids claiming offline-first unless
it is implemented. Queued writes are optional, with their consistency behaviour
documented if they exist.

## Options considered

### A — Offline-first customer management: local database, queued writes, sync

- Cons: every write becomes a conflict-resolution problem (ADR-0015 already
  keeps both edits on a 409 - offline makes that the normal case), personal
  data persists on shared machines, and the effort is a phase of its own.

### B — Cache API reads in the service worker

- Cons: rejected in ADR-0028.

### C — One explicit snapshot in the offline lab, and a banner everywhere (chosen)

## Decision

- **Everywhere**: `ConnectivityService` (core) follows `navigator.onLine` and
  the `online`/`offline` events. The shell shows a banner while offline -
  "nothing can be saved, what you see may be out of date" - and a toast on
  return. The realtime stream reconnects by itself (ADR-0020).
- **Offline lab**: the first 25 customers, read-through: fetched online and
  written to IndexedDB with the owner's id and the fetch time; shown from
  IndexedDB, labelled "saved copy from …, read-only", when offline or when the
  fetch fails; refreshed on reconnect. Only id, code, name and status are
  stored. The copy is deleted when the session ends in that tab, and on sight
  if it belongs to another user.
- **No write queue.** There is nothing to reconcile, so no consistency model
  is needed; the documentation says so rather than implying one.

## Reason

It demonstrates each requested capability for real, in the smallest place
where it can be done correctly, and keeps the customer workflow's guarantees
(a save either reached the server or visibly failed) untouched.

## Consequences

- The application is _not_ offline-capable, and docs/offline.md says exactly
  what works offline and what does not.
- `navigator.onLine === true` is not trusted to mean "server reachable": the
  snapshot is used when the fetch fails, whatever the browser reports.
- If the tab closes without the session ending in it, the snapshot remains
  until the same browser opens the lab again (deleted then if the user
  differs) or the user deletes it.

## Revisit when

- A workflow needs to work offline: that phase decides the write model first.
