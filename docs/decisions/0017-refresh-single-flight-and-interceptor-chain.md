# ADR-0017 — Refresh on demand, once at a time, with one retry; one job per interceptor

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 3

## Problem

The access token lives fifteen minutes; the refresh token eight hours, and it
is **rotated on use** - presenting it returns a new one and invalidates the old.
The application must keep a working user signed in across expiries without them
noticing, and must get three races right:

1. **Concurrent 401s.** A list page, its detail panel and an audit call can all
   fail together when the token expires. If each starts its own refresh, the
   second presents a refresh token the first has already spent; the server
   treats that as a replay and refuses it; the user is signed out for having
   had several requests in flight.
2. **A late 401.** A request that left with the old token can fail _after_ a
   refresh already finished. Refreshing again is the same replay.
3. **A cancelled trigger.** The request that started a refresh can be
   cancelled - the user navigated, `switchMap` unsubscribed - after the server
   has rotated the token but before the browser has read the response.

At the same time the Phase 3 prompt asks for interceptors for authentication,
correlation id, error handling and request timing/logging, _without_ putting
unrelated responsibilities in one of them. Phase 2's error-mapping interceptor
both mapped and logged failures, which would now log every silently-recovered
401 as an error.

## Options considered

### Option A — Proactive refresh on a timer

Schedule a refresh shortly before `expiresAt`.

- Pros: most requests never see a 401.
- Cons: timers are unreliable exactly when it matters - a sleeping laptop, a
  throttled background tab - so the reactive path is needed anyway. Every open
  tab runs its own timer and they race each other across tabs, which the
  single-flight in one tab cannot prevent. Two mechanisms to test instead of one.

### Option B — Reactive refresh, single flight, generation check (chosen)

On an `authentication` failure: join the refresh already in flight or start
one, then retry the original request once.

- Pros: one mechanism, driven by the server's actual answer rather than by the
  client's clock. Works identically after a sleep, a reload or a long idle.
- Cons: the first request after expiry pays one extra round trip.

### Option C — Queue every request while a refresh runs

Hold all outgoing requests, not only failed ones, until the refresh completes.

- Pros: no request is sent with a token known to be about to fail.
- Cons: the client does not know a token has expired until a request says so;
  queueing on a guess stalls working requests. Much more state for no benefit
  under reactive refresh.

## Decision

**Option B**, implemented in two places with one job each.

`SessionService.refresh()` keeps the observable of the refresh in flight and
hands it to every caller (`shareReplay`, cleared on `finalize`). It uses
`refCount: false` so that once started, a refresh **completes even if every
caller unsubscribes** - race 3.

`SessionService` keeps a **generation** number, bumped whenever the credential
changes. `authRefreshInterceptor` records it when a request leaves; on a 401 it
calls `renewAfter(sentAt)`:

| Generation since the request left | Session now       | Action                                     |
| --------------------------------- | ----------------- | ------------------------------------------ |
| unchanged                         | any               | join or start the single refresh (race 1)  |
| moved                             | authenticated     | retry without refreshing (race 2)          |
| moved                             | not authenticated | fail; a retry could only fail the same way |

Then the original request is retried **once**. A second 401 goes to the caller.
If the refresh fails, the caller receives the **original** `authentication`
error, the session ends, and `SessionService.ended$` emits `'expired'` **once** -
however many requests failed. One root-level subscriber
(`provideSessionExpiryRedirect`) navigates to
`/login?returnUrl=<current page>&reason=expired`.

Retrying writes is safe here for a specific reason: a 401 is decided by
`requireAuth` before any handler runs, so the failed request changed nothing.

### The interceptor chain

| #   | Interceptor      | One job                                          |
| --- | ---------------- | ------------------------------------------------ |
| 1   | `correlationId`  | stamp the request, put the id on the context     |
| 2   | `requestLogging` | time the request, log how it ended - once        |
| 3   | `authRefresh`    | renew an expired session and retry once          |
| 4   | `csrf`           | echo the CSRF cookie on unsafe same-origin calls |
| 5   | `errorMapping`   | `HttpErrorResponse` → `AppError`                 |

Logging moved out of error mapping. Because logging sits _above_ the refresh
interceptor, a request that was renewed and retried is one log line with the
time the user actually waited; because error mapping sits _below_ it, the
refresh logic reasons about `kind === 'authentication'`, never about `401`.
The CSRF interceptor sits below the refresh so a retried request is stamped
again from the cookie as it is now. The session endpoints opt out of refresh
with an `HttpContextToken` set where the request is made, not a URL list in
the interceptor.

## Reason

Refresh correctness is a property of _how many_ requests reach the server and
_in what order_. B makes that small enough to test exhaustively:
`auth-refresh.interceptor.spec.ts` asserts exactly one refresh for three
concurrent 401s, no refresh for a late 401, one retry and no more, the
original error on failure, a single `ended$`, and a refresh that survives the
cancellation of its trigger. Both mechanisms were removed in turn while
writing them, and each removal failed the tests written for it - the single
flight's two, and the generation check's two.

## Consequences

- Features never handle an expired session. The Phase 2 "sign in" link on the
  list's error state is gone - the page got simpler, as Phase 2 predicted.
- Query strings are no longer logged - they carry search terms, which are
  names and email addresses. Bodies and headers never were.
- Two tabs each refresh on their own. Rotation means the second tab's refresh
  can be refused if both fire at once; that tab then asks the user to sign in.
  Accepted and recorded as debt - cross-tab coordination is a browser-API
  concern (Phase 5).

## Revisit when

- the refresh token stops being rotated (then concurrent refreshes are merely
  wasteful, and the generation check could go);
- multi-tab coordination is added - the single flight then has to span tabs;
- a request type appears that must not be retried even after a 401.
