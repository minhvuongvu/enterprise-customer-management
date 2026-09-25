# ADR-0020 — The realtime client: own reconnect, de-duplication, and news that never overwrites

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 4

## Problem

ADR-0006 chose server-sent events for the scenario "user A updates C-000001,
user B is told". Phase 4 has to build the client, and four things about it are
not decided by that choice:

1. **Reconnection.** `EventSource` reconnects by itself after a network drop,
   but gives up for good on an HTTP error status - which is exactly what an
   expired access cookie produces - and never says which status it saw.
2. **Duplicates.** A reconnect with `Last-Event-ID` replays what was missed,
   and the replay can overlap what already arrived.
3. **What an event does to state.** The user may be reading the record the
   event is about, or editing it in a form filled from it.
4. **Lifetime.** A stream held open while signed out, or one per page, is a
   leak.

## Options considered

### Reconnect: let the browser do everything / own it all / both

- _Browser only_: stops forever after the first expired session.
- _Own it all_ (close on every error, reopen ourselves): throws away the
  browser's `Last-Event-ID` handling for ordinary drops.
- _Both_ (chosen): while `readyState === CONNECTING` the browser is retrying -
  report `reconnecting` and let it. Once `CLOSED`, take over.

### What an event does to the record on screen

- _Replace it_ with a fresh fetch: data changes under the reader; in the form,
  it would either overwrite typing or silently desynchronise the version the
  save is written against.
- _Flag it_ (chosen): mark the record stale, say so, offer one click to
  refresh. The list is different - it holds nothing the user typed - so a list
  on screen is refetched.

## Decision

`RealtimeClient` (root, one stream per tab):

- **Takeover reconnect.** When the browser has given up, wait with exponential
  backoff (1 s doubling to 30 s), then call `GET /auth/session` **through
  `HttpClient`**, so the refresh interceptor renews an expired access token -
  the one thing an `EventSource` cannot do for itself. Then open a new stream
  with `?lastEventId=` (a new stream cannot set the header). If the session
  cannot be renewed, stop: the application is already on its way to sign-in.
- **Replay and resync.** The mock keeps the last 200 events. A reconnect naming
  an id it still holds gets what came after; one it does not gets a `resync`
  event (not an SSE comment - the page never sees comments), and consumers
  revalidate everything they show instead of trusting a replay with a hole.
- **De-duplication** by event id, remembering the last 500, before any consumer
  sees an event.
- **Lifetime.** `AppShell` connects on creation and disconnects on destroy, so
  there is no stream on the sign-in page and none after sign-out or expiry -
  both of which leave the shell. `disconnect()` closes the stream, cancels the
  retry timer and the pending session check.

`CustomerRealtimeSync` (provided with `CustomerStore` on the customers route):

| Event about a customer | Cache                    | List on screen | Record on screen          | User is told                              |
| ---------------------- | ------------------------ | -------------- | ------------------------- | ----------------------------------------- |
| created                | pages dropped            | refetched      | -                         | centre                                    |
| updated                | pages and entity dropped | refetched      | **flagged**, not replaced | snackbar with "Refresh" + centre          |
| deleted                | pages and entity dropped | refetched      | **flagged**               | snackbar with "Back to the list" + centre |
| resync                 | pages dropped            | refetched      | flagged "unverified"      | -                                         |

The form page reads the same flag and offers ADR-0015's reload - their fields
refreshed, the user's typing kept - **before** the save, instead of a 409 after.

The user's own events are ignored: this tab applied them when its request
returned. A change the same user made in another tab is therefore not
announced; the list still catches up on its next fetch.

## Reason

Every rule above is chosen so that realtime news **cannot fight a local edit**:
nothing the user is reading or typing changes without their say-so, and the
places that hold no local state (the list, the cache) are refreshed freely.
That is the property the Definition of Done asks to be documented, and it is
what makes the scenario feel trustworthy rather than jumpy.

## Consequences

- One stream per tab. Six tabs on HTTP/1.1 use all six connections per origin
  (open question 5, carried to Phase 5 with the other browser-API work).
- The reconnect path is fully testable with a fake `EventSource`
  (`EVENT_SOURCE_FACTORY`), and was: drop, give-up, backoff, session renewal,
  resume-from-id, stop-on-expired, and cleanup.
- Outside `/customers` nothing listens for customer events - there is no
  customer state there to keep fresh.
- Answers open question 9: "drop every cached page on every write" survives a
  server that pushes changes, because pages are cheap to refetch and the one
  thing that is not - the record being edited - is flagged, never dropped from
  under the form.

## Revisit when

- the application needs to send over the channel (then WebSocket, ADR-0006);
- users routinely keep many tabs open (then one tab holds the stream and
  shares it, Phase 5);
- events must be shown for customers outside the customers section.
