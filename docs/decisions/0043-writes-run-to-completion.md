# ADR-0043 — A write, once started, runs to completion; the caller only decides whether it listens

**Status:** Accepted
**Date:** 2026-10-02
**Phase:** Phase 8

## Problem

`CustomerStore` returned cold observables for every write, and pages subscribed with
`takeUntilDestroyed`. Leaving the page unsubscribed, which aborted the HTTP request and
skipped the store's own `tap` and `catchError`: no cache update, no rollback of an
optimistic status, no news for other tabs. `finalize` still cleared the "pending"
marker. An aborted write is not an unsent one - the server may already have applied it.

The concrete symptom (found by the Phase 8 review, docs/enterprise-review.md D1): toggle
a status on the detail page, go back to the list at once. The PATCH is aborted, the
optimistic status stays on the list, `setCriteria` sees unchanged criteria and does not
refetch, and the list shows a status nothing confirmed. The realtime stream ignores the
user's own changes and cannot repair it.

Reads and file transfers are different: cancelling a read is the point of `switchMap`,
and a transfer the user can watch has a cancel button.

## Options considered

### Option A — callers must not use `takeUntilDestroyed` on writes

- Pros: no store change.
- Cons: a rule every page must remember, enforced by nothing; and a page that is gone
  would then update its own destroyed signals.

### Option B — the store subscribes to the write itself and returns a replay of the outcome

- Pros: one place; the request is sent exactly once; callers keep the idiomatic
  `takeUntilDestroyed`, which now means only "stop listening"; a late subscriber gets
  the same result or error. Same rule as `SessionService.refresh()` (`refCount: false`).
- Cons: writes become eager - calling `store.update()` sends the request whether or not
  anyone subscribes. Every caller subscribes immediately, so this changes nothing today,
  but it is a semantic difference from the rest of the RxJS code.

### Option C — `shareReplay({ refCount: false })` plus an internal subscription

- Pros: a familiar operator.
- Cons: `shareReplay` resets on error, so a subscriber arriving after a failure would
  re-execute the source - a second write. A `ReplaySubject` replays the error instead.

## Decision

Option B, as `runToCompletion()` in `customer-store.ts`: `create`, `update`, `remove`,
`runBulk` and `changeStatus` run to completion. `uploadAvatar`, `previewImport`,
`importFile`, `exportCsv` and every read stay cancellable.

## Reason

The store owns the cache and the rollback, so it must own the lifetime of the request
that settles them. A page owns only whether it wants to hear the answer.

## Consequences

- Leaving a page during a save no longer leaves state nobody confirmed; other tabs hear
  about the write.
- A write completing after the customers route is destroyed updates a store nobody
  reads - harmless, and the next visit refetches.
- "Discard changes" while a save is in flight no longer aborts the save
  (docs/enterprise-review.md FORM-2 - the dialog wording does not yet say so).
- New store writes must use `runToCompletion`; the three tests in
  `customer-store.phase4.spec.ts` ("a write whose caller stopped listening") are the
  template (debt 38).

## Revisit when

A write becomes long enough to need a user-visible cancel (then it is a transfer, and is
cancellable by design), or the store moves to a server-state library whose mutations
already have this property.
