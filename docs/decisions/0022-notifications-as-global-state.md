# ADR-0022 — Notifications are global state; three kinds of message; one confirmation

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 4

## Problem

Phase 4 asks for toasts, snackbars, confirmations and a notification centre with
an unread count, and says to use shared/global state _only where justified_.
ADR-0013 put all server state in a feature store with a route's lifetime; this
is the first thing that cannot live there.

## Decision

`NotificationService` is **root-provided** state, for two reasons that the
feature-store rule does not cover:

1. Producers and consumers are in different subtrees. Realtime news, an import
   result and a rolled-back optimistic update produce messages; the toast
   region and the bell in the header - both in the shell - show them.
2. Messages must outlive navigation. A toast about the save that just
   navigated away, and a centre entry the user reads ten minutes later, would
   both be destroyed with a route-scoped store.

It is cleared when the session ends, so the next person to sign in on the tab
does not inherit notifications about customers.

Three kinds of message, chosen by what the user can do about it:

| Kind         | Stays      | Action | For                                  |
| ------------ | ---------- | ------ | ------------------------------------ |
| toast        | 5 s        | none   | the outcome of the user's own action |
| snackbar     | 10 s       | one    | news the user may act on ("Refresh") |
| centre entry | until read | a link | anything worth finding again         |

Failures (`tone: 'danger'`) go to an **assertive** live region, everything else
to a polite one; both regions exist before content is put in them.

`ConfirmationService` asks yes-or-no questions through one dialog the shell
renders. It replaced two hand-rolled dialogs - leaving a dirty form and bulk
delete. The detail page's delete dialog was **not** migrated: it stays open to
show the outcome of the action it confirmed, which makes it a dialog of its
own rather than a question.

## Consequences

- Answers open question 7: the dialog still renders inline. Confirmations never
  stack - a second `confirm()` answers the first "no" - so the CDK overlay is not
  needed for that. Debt row 9's scroll lock is still open, and moves to Phase 6
  with the rest of the accessibility work.
- Toasts dismiss themselves on a timer and do not pause on hover or focus
  (WCAG 2.2.1). Anything that must not be missed also goes to the centre, where
  it waits; the timer pause is Phase 6 work (debt row 23).

## Revisit when

- notifications must persist across reloads or devices - that is a server
  feature, not a client store;
- a second kind of global state appears and tempts a store library.
