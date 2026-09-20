Continue working on the existing Angular enterprise learning repository.

This is Phase 4.

## Objective

Expand the Customer Management application with realistic enterprise UX patterns:

- file handling
- notifications
- realtime updates
- import/export
- audit logs
- optimistic updates
- advanced feedback states

## File Management

Customer avatar must support:

- file selection
- drag and drop
- file validation
- preview
- upload progress
- cancel upload
- upload failure
- retry

Do not block the entire page while uploading a file.

## Import

Implement:

CSV import

Flow:

Select file
→ Validate file
→ Upload
→ Parse
→ Preview
→ Validate rows
→ Confirm
→ Import
→ Progress
→ Result

Support:

- successful rows
- failed rows
- validation errors
- partial success

Provide downloadable error information if practical.

## Export

Support customer export.

Demonstrate:

- export request
- progress if applicable
- download
- error handling

## Audit Log

Implement:

/customers/:id/audit

Display:

- actor
- action
- timestamp
- changed fields
- old value
- new value

Do not expose sensitive data unnecessarily.

## Notifications

Create a global notification system.

Support:

- toast
- snackbar
- confirmation
- notification center
- unread count
- mark read
- mark all read

Use shared/global state only where justified.

## Realtime

Implement either WebSocket or Server-Sent Events.

Choose based on the actual use case and explain the decision.

Scenario:

User A updates Customer C001.

User B receives:

"Customer C001 was updated by another user."

User B should be able to refresh or revalidate the relevant server state.

Implement:

- connection state
- reconnect
- disconnect
- error
- duplicate event handling
- cleanup

## Optimistic Update

Demonstrate optimistic update for one suitable operation.

The implementation must support rollback if the server rejects the operation.

Document why optimistic update is appropriate for that operation.

## Concurrency

Introduce a realistic conflict scenario:

User A loads customer.
User B updates customer.
User A submits stale data.

Backend returns 409 Conflict.

Frontend must display an appropriate conflict state.

## Testing

Add tests for:

- upload
- upload cancellation
- import validation
- partial import failure
- notifications
- realtime events
- reconnect
- duplicate event
- optimistic update
- rollback
- 409 conflict

Add E2E scenarios where practical.

## Documentation

Update:

docs/realtime.md
docs/file-handling.md
docs/state-management.md

Document important trade-offs.

Run all checks before finishing.

---

## Definition of Done

Do not report this phase as complete until every item holds. Report any failing item as failing, with its output. Never mark a phase done with a known-broken check.

- [ ] `npm run format` clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` clean under `strict` + `strictTemplates`
- [ ] `npm run test` passing, meaningful assertions, no `.skip` left behind
- [ ] `npm run build` succeeds, including the server build
- [ ] `npm run e2e` passing
- [ ] The non-negotiable rules in `CLAUDE.md` hold for all new code
- [ ] No circular dependencies introduced
- [ ] No later-phase scope implemented, and no unrelated refactoring
- [ ] Upload does not block the page; cancel actually aborts the request
- [ ] Import reports per-row outcomes and handles partial success
- [ ] Realtime reconnects after a drop and de-duplicates repeated events — both tested
- [ ] Realtime cleanup happens on destroy; no leaked connection or subscription
- [ ] The optimistic update rolls back correctly when the server rejects it — tested
- [ ] The `409` conflict scenario has a real UI state, not a generic error toast
- [ ] Cache invalidation from realtime events is documented and does not fight local edits
- [ ] ADR-0001 / context §5.5 revisited: state explicitly whether the hand-written cache held up, and why
- [ ] The audit view exposes no sensitive data it does not need
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-4` and tagged
