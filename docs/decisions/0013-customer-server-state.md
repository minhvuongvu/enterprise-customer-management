# ADR-0013 — One feature store, an explicit cache, and cancellation by switching

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 2

## Problem

The customer feature has to answer three questions against a server - which
page of the list is on screen, which customer is open, and what has been done
to it - and keep answering them while the user pages, filters, types, saves and
deletes.

ANGULAR_PROJECT_CONTEXT.md §5.5 locks the shape: one signal-based store per
feature, an explicit cache keyed by the normalised query, documented
invalidation rules, and no store library. What it does not settle is the part
that decides whether the result is pleasant or awful to use: how a request is
superseded, what the UI is told while one is in flight, and who owns the
query.

## Options considered

### Option A — A store per screen

`CustomerListStore`, `CustomerDetailStore`, `CustomerAuditStore`, each provided
on its own route.

- Pros: each is small and its lifetime is obvious.
- Cons: they have to talk to each other. Deleting from the detail page must
  invalidate the list, so the detail store injects the list store anyway - and
  the cache ends up split across three owners, which is the arrangement §5.5
  exists to prevent.

### Option B — A single `providedIn: 'root'` store

- Pros: one owner, available everywhere.
- Cons: its lifetime is the tab. One user's browsing, and their cached records,
  survive leaving the section and - once Phase 3 exists - signing out.

### Option C — One feature store, provided by the feature's route

- Pros: one owner of the cache and the invalidation rules; a lifetime that
  matches the section the user is in; the list survives a trip to a detail page
  and is discarded on the way out.
- Cons: a path-less route whose only job is to carry `providers`, which is one
  more thing to explain.

## Decision

Option C, with four supporting decisions.

**The URL owns the query; the store owns the answer.** `setCriteria()` is
pushed in from the page, which reads it from the query string. The store holds
no page number, no filter and no sort of its own - a second copy is the thing
that drifts.

**Requests are a `Subject` through `switchMap`.** That single operator is the
whole cancellation story: a newer request unsubscribes the previous one, which
aborts it. Nothing compares request ids or timestamps to decide whether a late
response is still wanted, because the late response never arrives. A `Subject`
rather than `toObservable()` over a signal, so the pipeline runs when it is
asked to rather than at the next effect flush - "typing cancels the previous
search" is then a property of the code, not of Angular's scheduling.

**Debouncing is not in the store.** It lives next to the keystrokes, in the
filter component, and its output is a URL change. One mechanism therefore fixes
two problems at once: the server is asked once per settled search term, and the
back button walks through searches rather than through letters.

**States are a union, not flags.** `RemoteData<T>` is
`idle | loading | refreshing | success | error`. `refreshing` is the member
usually missing and the one that matters: it carries the value for _that same
request_, which is what lets a revisited page stay on screen instead of
flickering back to a skeleton. "Empty" is deliberately not a state - a list
with no rows is a successful answer, and making it a state forces every
consumer to remember two success cases.

### Cache invalidation rules

| Mutation | Cached pages | Cached entity                |
| -------- | ------------ | ---------------------------- |
| create   | all dropped  | the created record is stored |
| update   | all dropped  | replaced with the response   |
| delete   | all dropped  | dropped                      |
| bulk     | all dropped  | dropped for each success     |

Every mutation drops **all** pages rather than patching the affected row. A
write can change which page a record belongs on - under the default
`updatedAt,desc` an edit moves it to page one, and under a status filter a
deactivation removes it from the result set entirely. A patched cache would be
self-consistent and wrong, which is the hardest kind of wrong to see, because
every value on screen is individually correct.

Entities survive, because an id still means the same record.

## Reason

The expensive mistakes in a list screen are not visible in a screenshot: a
stale row after a save, a response from two keystrokes ago overwriting a newer
one, a spinner where the data was already known. Each of those is prevented
here by one small decision, and each of those decisions is legible - which is
the point of not reaching for a library in a repository that exists to be read.

## Consequences

- Leaving `/customers` discards the cache. Coming back re-fetches, which is
  correct and costs one request.
- A mutation refetches the list even when the user is not looking at it. One
  request, in exchange for the list being right when they arrive.
- The cache is bounded (twenty pages, least-recently-used eviction), so paging
  through 50,000 records does not accumulate them.
- `RemoteData` and the request-policy operators live in the customer feature
  because it is the only caller. They move to `core/` when a second feature
  needs them - a rename, which is the cheap direction.
- Reversing this means adopting a store library, which §5.5 already schedules
  as a Phase 4 question.

## Revisit when

Phase 4 applies realtime updates and optimistic writes to this cache. That is
the review §5.5 already requires, and the specific thing to watch is whether
"drop every page on every write" survives a server that pushes changes.
