# Cross-tab communication

Two tabs of the application in one browser profile share cookies,
`localStorage`, IndexedDB and the service worker - and, until Phase 5, nothing
else. Each behaved as if it were alone. This document covers what the
application now does across tabs, and the leader-election experiment.
Decisions: [ADR-0027](decisions/0027-cross-tab-coordination.md),
[ADR-0030](decisions/0030-leader-election-by-lease.md).

## What the application does across tabs

| Situation                          | Mechanism                             | Where                                                |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| A customer changed in tab A        | `BroadcastChannel`, topic `customers` | `CustomerStore.ownChanges$` → `CustomerRealtimeSync` |
| Sign-out in tab A                  | `BroadcastChannel`, topic `session`   | `core/auth/session-cross-tab.ts`                     |
| Two tabs renew the session at once | Web Lock `ecm.session.refresh`        | `SessionService.refresh()`                           |
| Theme chosen in tab A              | `storage` event                       | `ThemeService.followOtherTabs()`                     |

All four are covered by unit tests with a fake channel
(`core/testing/broadcast-testing.ts`) and by browser tests with two pages of one
context (`e2e/cross-tab.spec.ts`).

### Tab A changes a customer; tab B is told

1. Tab A's save succeeds. `CustomerStore` emits on `ownChanges$` - after the
   cache is updated, never for a failure or a rolled-back optimistic change.
2. `CustomerRealtimeSync` posts it on the tab channel:
   `{ topic: 'customers', payload: { change: 'updated', customerId, customerCode } }`.
3. Tab B's `CustomerRealtimeSync` validates the payload (`isOwnCustomerChange`)
   and reacts exactly as it does to another user's realtime event - the list
   refetches, the open record is flagged, not replaced - with a sentence that
   says where the change came from: _"Customer C-000001 was updated in another
   tab."_ A bulk action or an import posts `{ change: 'many' }`, and tab B
   revalidates everything.

Tab A never hears its own post: a `BroadcastChannel` does not deliver to its
sender. The realtime stream, which names the _user_, keeps ignoring the user's
own changes - so each change is announced exactly once, by the mechanism that
can tell who made it (debt row 25, paid).

### The channel

`core/cross-tab/TabChannel` holds one channel, `ecm.tabs.v1`, carrying
`{ topic, payload }`. Core knows no topics: the session and the customer
feature each own and **validate** their payload, because a tab still running
the previous build after a deploy is on the same channel. The name carries a
version for the day a payload cannot change compatibly.

It carries _that_ something changed, never the data. Each tab refetches
through its own HTTP layer, so no record crosses between tabs outside the
server's authorization.

### Sign-out ends every tab

A deliberate sign-out posts `{ event: 'signed-out' }`. Receiving tabs end their
session as `signed-out-elsewhere` - no request; the cookies are shared and
already gone - and go to sign-in with their page as `returnUrl` and a sentence
saying why. An **expiry is not broadcast**: a tab's refresh can fail because
that tab lost a race, while another tab holds a good session.

### Refresh under a Web Lock

Refresh tokens rotate on use. Two tabs whose access tokens expired together
each sent the same refresh token, and the server refused the second as a
replay (debt row 18). `SessionService.refresh()` now runs inside
`navigator.locks.request('ecm.session.refresh', ...)`: the browser grants the
lock to one tab at a time, and releases it when the request settles - or when
the holding tab dies. The second tab refreshes after the first, presenting the
rotated cookie the shared jar already holds. Single flight inside a tab is
unchanged. Without Web Locks the request runs unguarded, as before.

### The theme follows the storage event

The theme preference already lives in `localStorage`. The `storage` event fires
in every _other_ tab of the origin when it changes, so the theme needs no
sending code at all.

## BroadcastChannel vs the storage event

|                    | BroadcastChannel                         | `storage` event                                     |
| ------------------ | ---------------------------------------- | --------------------------------------------------- |
| Carries            | a message (structured clone)             | a change to a `localStorage` key                    |
| Persists           | no - a tab opened later sees nothing     | yes - the value stays; a later tab reads it         |
| Sender receives it | no                                       | no                                                  |
| Right for          | events: "signed out", "customer changed" | state that is stored anyway: a preference           |
| Wrong for          | state a new tab must see                 | messages - they would have to be written to be sent |

The cross-tab lab (`/technical-labs/cross-tab`) shows both side by side, and
the classic trap of the storage event: its shared counter is
read-modify-write, and two tabs clicking at the same instant can both read 4
and both write 5. `localStorage` has no transaction.

### Problem / solution / trade-offs

- **Problem**: tabs of one application acted on stale beliefs about the session
  and the data.
- **Solution**: one versioned `BroadcastChannel` for events, a Web Lock for the
  one operation that must not run twice at once, the `storage` event for a
  stored preference.
- **Why this solution**: each mechanism is used for what it is: messages,
  mutual exclusion, stored state. None of them carries data the server did not
  authorize for that tab.
- **Alternative**: a `SharedWorker` owning session and realtime state for all
  tabs - one place for shared state, but late in Safari, and it cannot reach
  the router or the stores.
- **Trade-offs**: payload validation on both ends; a channel name to version;
  one SSE connection per tab remains.
- **When not to use it**: for anything a server must see - cross-tab messages
  are UX. Never to copy data between tabs.

## One SSE connection per tab - open question 5

Answered: **one per tab stays** (ADR-0027). HTTP/1.1 allows six connections per
origin, so seven tabs over HTTP/1.1 would starve; a production reverse proxy
speaks HTTP/2, which multiplexes streams on one connection. Electing a leader
tab to hold the only stream and relay events would add relaying, a
single-tab failure mode and re-election latency - see the experiment below
for what that involves.

## Leader election (lab)

`/technical-labs/leader-election`. Exactly one tab runs a periodic job - asking
the server how many customers exist, standing in for any background poll that
should not multiply with the number of open tabs - and posts the result on a
`BroadcastChannel`; the other tabs only listen.

**A learning experiment, not a production lock.** The application uses Web
Locks where it needs exclusion.

### The algorithm (`lease-election.ts`)

One `localStorage` record is the lease: `{ holder, expiresAt }`.

| Constant       | Value | Meaning                                                |
| -------------- | ----- | ------------------------------------------------------ |
| `HEARTBEAT_MS` | 1000  | every tab looks at the lease this often                |
| `LEASE_MS`     | 3000  | a claim lasts this long unrenewed - three missed beats |
| `SETTLE_MS`    | 150   | a claimant waits this long, then re-reads its claim    |

On every heartbeat:

- **Leader** - if the record still names it, extend `expiresAt`. If it names
  another tab, this tab lost the lease while not looking: step down.
- **Follower** - if the record is missing or expired, **claim**: write its own
  id, wait `SETTLE_MS`, read back. Its id survived → leader; otherwise
  follower.

On `pagehide` the leader deletes the record and posts `resigned`; followers
tick at once, so takeover takes one settle, not a lease expiry. The job checks
the lease again **immediately before running**.

### Failure modes and race conditions

| What happens                                                                         | Effect                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two tabs both read "no lease", both write                                            | The re-read picks the last writer - if both re-reads come after both writes. A tab paused between its write and its re-read can see its own id after the other has confirmed itself: **two leaders**, briefly. |
| The leader is frozen (the "Freeze heartbeat" button, a busy main thread, a debugger) | Its lease expires; another tab claims it. The frozen tab still _believes_ it leads until its next heartbeat - another two-leader window. The pre-job lease check narrows it; it cannot close it.               |
| The leader's tab crashes or is killed                                                | No `pagehide`. Followers take over when the lease expires: up to `LEASE_MS + HEARTBEAT_MS + SETTLE_MS`, about 4 s.                                                                                             |
| `localStorage` is blocked                                                            | Writes are dropped (`KeyValueStorage` is best-effort); every tab claims and every re-read fails: **no leader**, job never runs.                                                                                |
| Clock change                                                                         | `expiresAt` uses `Date.now()`, shared by the tabs of one machine; a clock jump can expire or extend every lease at once.                                                                                       |

Because two leaders are possible, **the job must be idempotent**. This one is
a read.

### Browser lifecycle

- **Background timer throttling**: hidden tabs run timers at most once per
  second; after five minutes hidden, Chrome's intensive throttling allows one
  wake-up per minute. A hidden leader then misses renewals, loses the lease,
  and a visible tab takes over - correct, but leadership flaps between hidden
  tabs. `LEASE_MS` must exceed the throttled heartbeat interval, which a 3 s
  lease does not in intensive throttling.
- **Page freeze / discard**: a frozen tab runs nothing, like the button; a
  discarded tab is a crash.
- **Back/forward cache**: `pagehide` fires on the way into the cache, and the
  lab resigns - which is why it listens to `pagehide`, not `unload` (an
  `unload` listener also disables the cache).

### Limitations, and the alternative

- No fencing token: a stale leader's result is indistinguishable from a
  current one. A real design attaches the lease generation to each result.
- `localStorage` is synchronous and shared by every tab: a write in one tab
  blocks on the storage lock the others use.
- **Web Locks** remove the races: `navigator.locks.request('leader', () => new
Promise(() => {}))` - hold a never-settling lock; the browser grants it to
  the next waiting tab when the holder dies. That is the production answer;
  the lease is kept here because its failure modes are the lesson.

### Problem / solution / trade-offs

- **Problem**: a periodic job runs once per open tab, multiplying server load
  and producing different answers in each.
- **Solution**: elect one tab; broadcast its results.
- **Why this solution** (for the lab): every part - lease, heartbeat, settle,
  step-down - is observable and can be broken on purpose.
- **Alternative**: Web Locks (correct, opaque); a `SharedWorker` running the
  job once (correct, but no DOM and uneven support); a server push (the job
  does not run in the browser at all).
- **Trade-offs**: timers in every tab; two-leader windows; tuning `LEASE_MS`
  against background throttling.
- **When not to use it**: whenever correctness matters - use Web Locks. And
  whenever the job can move to the server.
