# ADR-0023 — One optimistic operation: changing a customer's status

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 4

## Problem

Phase 4 asks for an optimistic update on one suitable operation, with rollback
when the server rejects it, and for the choice to be justified. Phase 2 made
every mutation wait for the server, which is the honest default.

## Options considered

| Operation         | Optimistic? | Why                                                                     |
| ----------------- | ----------- | ----------------------------------------------------------------------- |
| create            | no          | no id or code until the server assigns one; a row with neither is a lie |
| delete            | no          | a record that vanishes and then reappears on failure is alarming        |
| edit many fields  | no          | validation only the server can do (unique email) fails it often         |
| bulk actions      | no          | the answer is per item; guessing it hides the partial failure           |
| **status change** | **yes**     | one field, almost always accepted, visible, easily undone               |

## Decision

`CustomerStore.changeStatus()` on the detail page's Activate / Deactivate:

1. Take the newest copy of the record the store holds.
2. Put the optimistic copy **everywhere the record is shown**: the open detail,
   the cached entity, the row on the list page in state.
3. `PATCH { status, version }` against the version the user saw.
4. On success, the server's record replaces the optimistic one (it carries the
   new version) and cached pages are dropped.
5. On failure, put the previous record back in each place - **only where the
   optimistic copy is still what is shown**. If a refresh brought something
   newer in the meantime, it is left alone: rolling back would put an older
   record over a newer one.

The failure is announced in the assertive live region: the user saw the
change happen, and it did not. A `409` also reloads the record.

## Consequences

- The store gained `recordFor`, `show` and `rollback` - about forty lines - and
  no library. Answers open question 2: the hand-written cache held up (see
  `docs/state-management.md`).
- Tested for success, 500, 409, the "newer record arrived meanwhile" case, and
  a role that may not update (refused before any optimistic change is shown).

## Revisit when

- a second operation wants optimism - extract the snapshot/rollback into a
  helper then, not before;
- statuses gain server-side rules that commonly reject a change.
