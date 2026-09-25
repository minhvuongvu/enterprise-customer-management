# Realtime

How the application learns that someone else changed a customer, and what it does
about it. Decisions: [ADR-0006](decisions/0006-sse-over-websocket.md) (SSE over
WebSocket) and [ADR-0020](decisions/0020-realtime-client.md) (this client).

## The scenario

User A updates customer C-000001. User B, who has C-000001 open, sees:

> Customer C-000001 was updated by another user. **Refresh**

The record on B's screen is **not** replaced. A banner says it may be out of date;
one click brings it current. The list, if B is on it, is simply refetched. The
notification centre keeps an entry with a link.

## Why server-sent events

Every event travels from server to client; nothing travels back. SSE is one-way
HTTP: the session cookie authenticates it, the dev proxy and a production reverse
proxy carry it unchanged, CORS already covers it, and the browser brings
reconnection and `Last-Event-ID`. WebSocket would add a second protocol and a
second authentication story for a direction nothing uses.

## The pieces

```text
mock API  GET /api/events ── id / event / data, heartbeat every 15 s
             │               replay buffer: last 200 events, `Last-Event-ID` or ?lastEventId=
             ▼
RealtimeClient (core/realtime, root)        one stream per tab, opened by the shell
  status: idle | connecting | open | reconnecting
  events$  - validated against the contract, de-duplicated by id
  resync$  - "cannot say what you missed: revalidate"
             │
             ▼
CustomerRealtimeSync (customers route, beside CustomerStore)
  ├─ CustomerStore.applyRemoteChange / revalidateAll
  └─ NotificationService: snackbar for the record on screen, centre entry always
```

## Connection state

Shown in the header (a dot and a word, announced politely), because a user who
believes the list updates itself should know when it has stopped.

| State          | Meaning                                                             |
| -------------- | ------------------------------------------------------------------- |
| `idle`         | not connected - signed out, or not in the application shell         |
| `connecting`   | first connection in progress                                        |
| `open`         | events are arriving                                                 |
| `reconnecting` | the stream dropped; the browser, or this client, is getting it back |

## Reconnect

Two kinds of failure, handled differently:

1. **A dropped connection** - the proxy timed out, the server restarted, Wi-Fi
   blinked. The browser keeps the `EventSource` in `CONNECTING`, retries on its
   own, and sends `Last-Event-ID`. The client reports `reconnecting` and lets it.
2. **An error status** - most often an expired access cookie. The browser closes
   the `EventSource` for good and does not say why. The client then:
   1. waits - 1 s, doubling each failure, capped at 30 s;
   2. calls `GET /auth/session` through `HttpClient`, so the refresh interceptor
      renews an expired access token on the way;
   3. opens a new stream with `?lastEventId=<last id seen>`.

   If the session cannot be renewed it stops: the session has ended, and the
   application is already sending the user to sign in.

## Duplicates

Duplicate delivery is **normal** with SSE: a replay after a reconnect overlaps
what arrived before the drop. The client remembers the last 500 event ids and
drops any it has seen before any consumer sees it. The mock can re-deliver an
event on demand (`POST /api/_mock/events/duplicate`), which is how the E2E suite
proves it.

## Missed events

The server replays events after the id the client names, from a 200-event buffer.
If the id is not in the buffer - away too long, or the server restarted - it sends
a `resync` event instead of a partial replay. The customer feature then drops its
cached pages, refetches the list on screen, and marks the open record
"unverified".

## Cache invalidation, and why it never fights a local edit

| Where                     | On news about a customer                                  | Why                                              |
| ------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| cached list pages         | all dropped                                               | any page might contain it; cheap to refetch      |
| cached entity             | dropped                                                   | the next visit loads it fresh                    |
| list on screen            | refetched now                                             | holds nothing the user typed; selection survives |
| list not on screen        | marked stale, refetched on the next visit                 | no request for a list nobody is looking at       |
| record on the detail page | **flagged, not replaced**; banner + "Refresh"             | the user may be reading it                       |
| record in the edit form   | **flagged, not replaced**; "reload, keeping your changes" | the user's typing is theirs; ADR-0015's merge    |

The user's own changes are ignored - this tab applied them when the request
returned, and "updated by another user" would be false.

## Cleanup

The shell connects on creation and disconnects on destroy. Signing out and an
expired session both leave the shell, so both close the stream. `disconnect()`
closes the `EventSource`, cancels a pending reconnect timer and cancels a pending
session check. The customer sync is provided by the customers route and
unsubscribes when the route's injector is destroyed. All of this is unit tested.

## Testing

| What                                                                                                                            | Where                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| connection state, reconnect, backoff, session renewal, resume-from-id, stop on expired session, de-duplication, resync, cleanup | `core/realtime/realtime-client.spec.ts` with a hand-driven fake `EventSource`     |
| replay, resync, per-session disconnect, duplicate delivery, `customerCode`                                                      | `apps/mock-api/test/events.spec.ts`                                               |
| what an event does to the store and the notifications                                                                           | `customers/state/customer-realtime-sync.spec.ts`, `customer-store.phase4.spec.ts` |
| two users, a real browser: news, refresh, duplicate shown once, reconnect after a server drop                                   | `e2e/enterprise-ux.spec.ts`                                                       |

## Known limits

- One stream per tab; six tabs exhaust HTTP/1.1's per-origin connection limit
  (open question 5, Phase 5).
- A change the same user makes in another tab is not announced.
- Customer events are only acted on inside the customers section.
