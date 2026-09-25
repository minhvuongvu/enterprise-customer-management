# State management

What state exists, who owns it, how long it lives - and, as Phase 4 had to answer,
whether the hand-written approach held up once realtime updates and an optimistic
update arrived.

## The kinds of state

| State                         | Owner                              | Lifetime               | Global? |
| ----------------------------- | ---------------------------------- | ---------------------- | ------- |
| list criteria                 | the URL                            | the address bar        | -       |
| server data (customers)       | `CustomerStore` + `CustomerCache`  | the `/customers` route | no      |
| staleness of the open record  | `CustomerStore.detailStaleness`    | the `/customers` route | no      |
| optimistic status in flight   | `CustomerStore.statusPending`      | the `/customers` route | no      |
| form values, dirty, conflict  | the form page                      | the page               | no      |
| selection, bulk report        | the list page                      | the page               | no      |
| an upload or import in flight | the avatar component / import page | the component          | no      |
| session, permissions          | `SessionService`                   | the tab                | **yes** |
| notifications, centre         | `NotificationService`              | the session            | **yes** |
| the confirmation on screen    | `ConfirmationService`              | one question           | **yes** |
| the event stream              | `RealtimeClient`                   | the shell              | **yes** |

Global state is the exception and each instance has a stated reason: the session
is needed everywhere; notifications are produced and consumed in different
subtrees and must survive navigation (ADR-0022); the event stream is one per tab
(ADR-0020). Everything about customers stays in the feature.

## The customer store in Phase 4

ADR-0013's design - one store, an explicit cache, cancellation by `switchMap` -
gained four things:

- **Watching the list.** `watchList()` returns its own release. A write or an
  event refetches the list only while a page is showing it, and otherwise marks
  it stale so the next visit refetches (pays debt row 15).
- **Remote changes.** `applyRemoteChange()` drops cached pages and the entity,
  refetches a watched list, and **flags** the open record rather than replacing
  it. `revalidateAll()` does the same after a resync.
- **Optimistic status.** `changeStatus()` shows the change everywhere, confirms it
  with the server, and rolls back only where the optimistic copy is still what is
  shown (ADR-0023).
- **File transfers.** `uploadAvatar`, `previewImport`, `importFile`, `exportCsv`
  - each with the same action authorization as every other write, each narrowing
    `HttpEvent` to `progress | done` at the API boundary.

## Did the hand-written cache hold up? (ADR-0001 / context §5.5, open question 2)

**Yes, and no store library is needed.** The question was whether realtime and
optimistic updates would push the hand-written approach past what it can
express. What they actually required:

| Requirement                                  | What it cost                                      |
| -------------------------------------------- | ------------------------------------------------- |
| invalidate on news                           | the existing `invalidatePages()` / `dropEntity()` |
| do not refetch a list nobody watches         | a counter and a flag                              |
| do not overwrite what the user is looking at | one signal (`detailStaleness`)                    |
| optimistic update + rollback                 | `recordFor` / `show` / `rollback`, ~40 lines      |
| do not roll back over newer data             | an identity check on the optimistic object        |

Each of these is a _policy_ decision, and a store library would not have made
any of them - it would have supplied a different place to write them. The
explicit version keeps the policies next to the explanation of why, which is
what this repository is for. The trigger to revisit: a second feature needing
the same cache machinery, or several optimistic operations wanting a shared
snapshot/rollback helper.

## Cache invalidation rules, complete

| Event                                                | Pages           | Entity                                | List on screen | Open record                        |
| ---------------------------------------------------- | --------------- | ------------------------------------- | -------------- | ---------------------------------- |
| create (this user)                                   | drop            | put the new one                       | refetch        | -                                  |
| update (this user)                                   | drop            | put the saved one                     | refetch        | replaced with saved                |
| delete (this user)                                   | drop            | drop                                  | refetch        | cleared                            |
| bulk (this user)                                     | drop            | drop changed                          | refetch        | -                                  |
| optimistic status (this user)                        | drop on success | optimistic, then saved or rolled back | row patched    | patched, then saved or rolled back |
| avatar upload / import (this user)                   | drop            | -                                     | refetch        | refetched (upload)                 |
| any change by **another** user                       | drop            | drop                                  | refetch        | **flagged**                        |
| any change by this user in **another tab** (Phase 5) | drop            | drop                                  | refetch        | **flagged**                        |
| resync, or a bulk/import in another tab              | drop            | -                                     | refetch        | flagged unverified                 |

"Refetch" on a list nobody is watching means "refetch on the next visit".
