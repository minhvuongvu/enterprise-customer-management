# ADR-0016 — Session tokens live in HttpOnly cookies; the application never holds one

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 3
**Supersedes:** [ADR-0012](0012-phase-2-session-boundary.md)

## Problem

Phase 3 implements the whole session lifecycle - sign-in, current user, expiry,
refresh, failed refresh, sign-out. Every one of those depends on one earlier
choice: **where the access and refresh tokens are kept, and who can read them.**

The Definition of Done states the constraint directly: no token is placed in
`localStorage` without an ADR that justifies it. This is that ADR, and it
concludes that no token is placed in _any_ storage the application can read.

ADR-0012 drew the line for Phase 2 at "can a request be made at all" and said
Phase 3 should supersede it rather than extend it. It is superseded here.

## Options considered

### Option A — Bearer token in `localStorage`

The server returns the access token in the body; the client stores it and an
interceptor adds `Authorization: Bearer …` to every request.

- Pros: the most common tutorial pattern. Survives a reload. Works cross-origin
  without cookies, and is immune to CSRF because the browser never attaches it
  on its own.
- Cons: **any script that runs on the origin can read it** - one XSS, one
  compromised dependency, one injected analytics tag, and the token leaves the
  building, where it keeps working until it expires. `localStorage` also
  outlives the tab and is shared by every tab on the origin. The CSRF immunity
  is real, but it is bought by making XSS worse, and XSS is the harder of the
  two to rule out.

### Option B — Bearer token in memory, refresh token in an HttpOnly cookie

The access token lives in a JavaScript variable; a reload calls a refresh
endpoint, authenticated by a cookie, to get a new one.

- Pros: an XSS cannot read the refresh token, and the stolen access token is
  short-lived. A common, defensible production pattern.
- Cons: an XSS can still read the access token from memory, or simply make
  requests from the page while it runs. Two credential mechanisms - a header
  and a cookie - so the application needs both CSRF protection _and_ token
  plumbing. More client code for a threat model that is only somewhat better.

### Option C — Both tokens in HttpOnly cookies

The server sets `ecm_access` and `ecm_refresh` as `HttpOnly; SameSite=Lax`
cookies (`Secure` wherever there is TLS). The browser attaches them; no script
can read them. A third, deliberately readable cookie carries a CSRF token that
must be echoed in a header (double submit).

- Pros: **nothing a script can exfiltrate**. An XSS can still act as the user
  while it runs - nothing in the browser prevents that, and this ADR does not
  claim otherwise - but it cannot take a credential away and use it later.
  The application code is smaller: no token handling at all, no `Authorization`
  interceptor. The refresh cookie is scoped to `/api/auth/refresh`, so it is
  not sent with, and cannot leak from, any other request.
- Cons: cookies are sent automatically, so CSRF must be defended - here by
  `SameSite=Lax` plus the double-submit token, both already in place since
  Phase 0.5. Cookies are per-origin, so the API must be same-origin (a dev proxy
  locally, a reverse proxy in production) or CORS must allow credentials from
  an explicit origin list. The application cannot read the expiry from the
  token, so the server reports it in the response body.

## Decision

**Option C.** The application never sees a token. `SessionApi` receives the
user and `expiresAt`; the browser carries the credential.

What the client keeps, in memory only, in `SessionService`:

| Held                    | Why                                                           |
| ----------------------- | ------------------------------------------------------------- |
| status                  | `unknown` / `anonymous` / `authenticated` - drives the guards |
| user, role, permissions | what the UI shows and hides. The server derived them          |
| `expiresAt`             | informational; refresh is reactive (ADR-0017)                 |
| a generation counter    | to recognise a 401 about a token that was already replaced    |

Nothing is written to `localStorage` or `sessionStorage`. A reload restores the
session by asking `GET /auth/session`, which the cookies authenticate.

## Reason

For this repository the deciding argument is the one the context document asks
every security decision to make explicit (4.12): _who can read the credential._
With C the answer is "the browser and the server", and nothing the frontend
does - or fails to do - changes it. A and B both put the answer partly in the
hands of every script on the page.

C also makes the frontend's part honest. The application cannot secure a
token; it can only avoid holding one. So it holds none.

## Consequences

- There is no `Authorization` interceptor, and that is the design, not a gap.
  The interceptor chain is documented in `core/http/http.providers.ts`.
- CSRF protection is load-bearing and must never be removed: `SameSite=Lax`
  plus `csrfInterceptor` plus the server's `requireCsrf`.
- The API must be reached same-origin. Serving the SPA and the API from
  different sites would require `SameSite=None; Secure` and a CORS allowlist -
  a change to this ADR, not a configuration tweak.
- **Sign-out cannot delete the cookies from script** - they are `HttpOnly`. It
  asks the server, which destroys the session and expires the cookies. If that
  request never arrives, the tab is signed out but the server session lives
  until it expires. `docs/security.md` states this.
- The mock's logout now finds the session by the CSRF token when the access
  cookie is gone. Without that, signing out after a long idle - when the
  browser had already dropped the expired access cookie - left the refresh
  token alive, because its cookie is scoped to the refresh path and never
  reaches `/logout`.
- `/auth/session` now reports the access token's **real** expiry. It used to
  report "now plus the TTL", which told a reloaded client it had fifteen
  minutes it did not have.

### The sign-in page stays prerendered (open question 8)

Phase 2 asked whether `/login` should stop being prerendered because typing
into it before hydration is lost (debt row 13). Phase 3 keeps it prerendered.
Every redirect this phase adds - the guard, an expired session - is a
client-side navigation inside an already-running application, which never
shows the prerendered HTML. Only a cold load of `/login` does, and there the
submit button is disabled until hydration, so the credential cannot leak. The
remaining cost is lost keystrokes on a cold load; debt row 13 moves to
Phase 5, which owns rendering.

## Revisit when

- the API has to be served from a different site than the application;
- a non-browser client (mobile app, CLI) needs the same API - it will want
  bearer tokens, and the server would then issue both;
- tabs must learn about a sign-out in another tab immediately rather than on
  their next request (a `BroadcastChannel`, Phase 5).
