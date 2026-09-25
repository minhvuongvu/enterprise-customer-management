# ADR-0027 — Tabs coordinate through one versioned BroadcastChannel, a Web Lock for refresh, and the storage event for stored preferences

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Three debts shared one cause - each tab behaved as if it were the only one:

- debt 18: a sign-out in one tab left the others showing customer data until
  their next request; two tabs refreshing together had one refused (the
  refresh token rotates on use, and the second tab spent a spent token);
- debt 25: a change the user made in one tab was invisible in the others -
  the realtime stream names the _user_, and ignores the user's own changes;
- open question 5: one SSE connection per tab, or one shared?

## Options considered

### For messages: BroadcastChannel, or the storage event, or a SharedWorker

- **Storage event**: works everywhere, but carries only what is _written_ to
  storage and stays there - a message would have to be stored to be sent.
- **SharedWorker**: one place for shared state, but Safari's support came late
  and a worker cannot touch the router or the store.
- **BroadcastChannel** (chosen): a message bus; nothing is stored; never
  delivered back to the sender.

### For the refresh race: a lease in localStorage, or Web Locks

- A lease has a race of its own (see ADR-0030). **Web Locks** (`navigator.locks`)
  are real mutual exclusion within an origin, granted in order, released when
  the holder's promise settles or its tab dies (chosen).

### For one stream per tab: elect a leader to hold the SSE connection

- Pros: one connection per browser, not per tab.
- Cons: every event must be relayed; the leader's death is an outage until
  re-election; the six-connection limit is HTTP/1.1's, and the reverse proxy in
  front of a real deployment speaks HTTP/2, where streams are multiplexed.

## Decision

- `core/cross-tab/TabChannel`: one channel, `ecm.tabs.v1`, carrying
  `{ topic, payload }`. Core knows no topics; each owner validates its own
  payload, because a tab running an older build may be on the channel.
- The session posts `signed-out` on a deliberate sign-out only - never
  `expired`, which may be one tab's own lost race. Receiving tabs end with
  `signed-out-elsewhere` and go to sign-in, keeping their page as `returnUrl`.
- `SessionService.refresh()` runs inside the Web Lock `ecm.session.refresh`.
  The second tab's refresh starts after the first finishes, with the rotated
  cookie already in the shared jar.
- The customer store emits `ownChanges$` after the server accepts a change;
  `CustomerRealtimeSync` posts it, and in other tabs reacts exactly as to
  another user's change, with "in another tab".
- The theme follows the `storage` event: it is a stored preference already.
- **Open question 5 is answered: one stream per tab stays.** The leader
  experiment (ADR-0030) is kept in a lab.

## Reason

Messages say _that_ something changed; each tab then refetches through its own
HTTP layer and its own authorization. Nothing crosses the channel that a tab
could not have fetched itself, so the channel adds no new trust path.

## Consequences

- Every cross-tab behaviour is testable with a fake channel in unit tests
  (`core/testing/broadcast-testing.ts`) and with two pages of one browser
  context in E2E (`e2e/cross-tab.spec.ts`).
- A browser without Web Locks refreshes unguarded - the old behaviour, still
  safe because a refused refresh asks the user to sign in.
- A change to a payload shape must stay readable by the previous build, or
  bump the channel name.

## Revisit when

- Profiling shows tabs × SSE connections is a real cost on HTTP/2.
- Sign-in should propagate too (a tab on the sign-in page could follow).
