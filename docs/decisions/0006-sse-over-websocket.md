# ADR-0006 — Server-sent events rather than WebSocket

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0.5

## Problem

The application needs to be told when a customer changes under it, when an import
finishes, and when the system has something to say. Phase 4 builds the UX; Phase 0.5
has to choose the transport, because the mock API has to expose one and the contract
has to describe its events.

## Options considered

### A. WebSocket

Pros: bidirectional; the obvious choice if the client ever needs to push.
Cons: a second protocol with its own lifecycle. Reconnection, backoff, heartbeats and
message framing are all the application's problem. Some corporate proxies mishandle
the upgrade. Authentication is awkward: the browser's WebSocket API cannot set
headers, so a cookie-authenticated handshake is the only clean option and it is
easy to get wrong.

### B. Server-sent events

Pros: plain HTTP, so the existing cookie authentication, CORS configuration and proxy
all apply unchanged. The browser reconnects automatically and replays
`Last-Event-ID`. The wire format is three lines of text, which means the failure modes
are inspectable with curl.
Cons: one direction only. Limited to six connections per origin on HTTP/1.1, which
matters for a user with many tabs. No binary frames.

### C. Polling

Pros: nothing new at all.
Cons: either slow to notice a change or wasteful; and it makes the "another user
edited this record" scenario feel artificial, which is the scenario the feature exists
for.

## Decision

Server-sent events, at `GET /api/events`.

Every event carries an `id`, an `event` type and a JSON `data` payload. A comment
heartbeat is sent every 15 seconds.

## Reason

Every event in this application travels from the server to the client. Nothing travels
back — user actions are already HTTP requests with responses. Choosing a bidirectional
transport to carry one-directional traffic means paying for reconnection logic,
framing and a second authentication path, and getting nothing for it.

The reconnection behaviour is the strongest argument. A browser's `EventSource`
reconnects on its own and tells the server where it left off; a hand-written WebSocket
reconnect loop with backoff is a well-known source of bugs, and writing one badly is
not a lesson worth building in.

The HTTP/1.1 connection limit is real, and it is the reason Phase 5's cross-tab work
exists: one tab should hold the connection and share what it receives. That is a
better exercise than adding a protocol.

## Consequences

- Duplicate delivery is normal, not a bug. Events carry ids so a client can discard
  what it has already applied, and the contract says so.
- The heartbeat is required. Without it a proxy closes an idle connection and the
  stream looks alive while delivering nothing.
- `X-Accel-Buffering: no` is set, because a buffering proxy holds events until its
  buffer fills and makes the stream look broken.
- Connections must be cleaned up on close. The store would otherwise keep a reference
  to every response object a browser ever opened.
- If Phase 4 finds a genuine client-to-server channel, this is the decision to revisit
  — not something to bolt onto SSE with a side-channel POST.

## Revisit when

- The client needs to push messages that are not requests.
- The six-connection limit becomes a problem that cross-tab coordination cannot solve.
