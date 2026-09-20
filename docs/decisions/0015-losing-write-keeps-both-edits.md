# ADR-0015 — A write that loses a race reloads and keeps both edits

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 2

## Problem

The API answers `409` when an update carries a version that is no longer
current: someone saved while this form was open. The mock puts the record's
`currentVersion` in the error envelope's details, which is also what
distinguishes that case from the other thing 409 means here - a duplicate email
on create, which carries no version.

What the client does next is a product decision with three bad answers and one
good one, and getting it wrong destroys a colleague's work silently.

## Options considered

### Option A — Show the error and stop

"Someone else changed this record." The user re-opens the form and retypes.

- Pros: nothing is lost by the application.
- Cons: everything is lost by the user. This is the version most applications
  ship, and it is why people keep a copy of long forms in a text editor.

### Option B — Reload the record into the form

Fetch the current record and fill the form from it.

- Pros: the next save will succeed.
- Cons: it discards the user's edit to do so - the thing they are least able to
  reconstruct and most likely to assume was kept.

### Option C — Force the write

Re-fetch the version and resubmit unchanged.

- Pros: one click, and the user's work survives.
- Cons: the _other_ person's work does not, and nobody is told. It converts a
  detected conflict back into the silent overwrite that versioning exists to
  prevent.

### Option D — Reload the record, keep the form, resubmit the difference

- Pros: both edits survive when they touch different fields, which is the
  common case.
- Cons: two reference points to keep straight, and a genuinely subtle bug if
  they are confused.

## Decision

Option D.

A conflict shows a panel with one action: **reload the newest version**. The
form's values are untouched. When the reload lands, the notice says so and the
user presses save again.

It works because the update is a PATCH computed from two _different_ records,
and the distinction is the whole decision:

- **`baseline`** is the record the form was filled from. The difference between
  it and the form is, by definition, what **this** user changed. It does not
  move when the record is reloaded.
- **`latest`** is the newest record the client knows about, and supplies only
  the `version` the write states itself against.

So after a reload, the payload still contains just this user's fields, stated
against a version the server will accept. A field the other person changed is
absent from the payload, so their work is kept.

## Reason

Getting this wrong is not hypothetical - it is what the first implementation
did. Measuring the difference against the _newest_ record meant that every
field the other person had just changed now differed from what was in this
form, so it went into the patch as this user's value and silently reverted
them. The end-to-end test caught it, and only because the test asserts on the
_other_ person's field rather than on the save succeeding.

That is the argument for Option D over the alternatives: the others are all
easier to implement and each of them loses somebody's work without saying so.

## Consequences

- Two fields on the form page instead of one, with names that say what they
  are for. `customer-form-model.spec.ts` asserts the property directly: a
  newer version does not widen what is sent.
- Conflicts on fields that genuinely collide are still conflicts. The second
  save simply overwrites for that field, with the reload having given the user
  the chance to see the current value first. A per-field merge UI is a much
  larger feature and is not justified by this domain.
- The 409 path is reachable in a test without a fault-injection header: the
  E2E test updates the record through the API while the form is open, which is
  what really happens.
- A 409 with no `currentVersion` is treated as a duplicate email and marked on
  the email field. That inference is only valid because this API uses 409 for
  exactly two things; a third would need the server to say which.

## Revisit when

A second client starts pushing changes in realtime (Phase 4). Once a form can
be told that the record changed _before_ the user presses save, the reload
becomes something the application can offer at the moment it happens rather
than after a failed write.
