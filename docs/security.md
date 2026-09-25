# Security

How this application is protected, **who owns each protection**, and what is
deliberately not done.

The rule this document exists to enforce (ANGULAR_PROJECT_CONTEXT.md 4.12):
**a frontend-only mechanism is never described as a security guarantee.** Code
that runs in the user's browser runs on a machine the user controls. It can be
read, paused, edited and bypassed. What it provides is _experience_ - telling
a user early and clearly what the server will do. What protects data is the
server, the browser's own enforcement of the headers and cookie flags the
server sets, and the proxy in front of both.

---

## Ownership at a glance

Four owners, and every control below names one.

| Owner             | Means in this repository                                        | Means in production                         |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------- |
| **Frontend**      | `apps/web` - Angular                                            | the same                                    |
| **Backend**       | `apps/mock-api` - a real Express server (ADR-0007)              | the real API                                |
| **Browser**       | behaviour the browser enforces because a header or flag asked   | the same                                    |
| **Reverse proxy** | the Angular dev proxy; `apps/mock-api` stands in for some of it | nginx / a CDN / an ingress in front of both |

| Control                                         | Owner                           | Security or UX       | Where                                                         |
| ----------------------------------------------- | ------------------------------- | -------------------- | ------------------------------------------------------------- |
| Password verification                           | Backend                         | security             | **not done by the mock** - see "What is not done"             |
| Session tokens unreadable by script             | Backend sets, Browser enforces  | security             | `HttpOnly` cookies, `auth.routes.ts`; ADR-0016                |
| Session expiry, refresh-token rotation          | Backend                         | security             | `domain/sessions.ts`                                          |
| Invalidating a session on sign-out              | Backend                         | security             | `POST /api/auth/logout`                                       |
| Authentication on every API request             | Backend                         | security             | `requireAuth`                                                 |
| Authorization on every API request              | Backend                         | security             | `requirePermission`; `test/authorization.spec.ts`             |
| Route guards (`authGuard`, `requirePermission`) | Frontend                        | **UX**               | `core/auth/*.guard.ts`                                        |
| Hiding actions (`*appIfPermitted`)              | Frontend                        | **UX**               | `core/auth/if-permitted.directive.ts`                         |
| Refusing actions before sending                 | Frontend                        | **UX**               | `CustomerStore.refuseUnless`                                  |
| Refresh on expiry, single flight                | Frontend                        | correctness          | `authRefreshInterceptor`, `SessionService`; ADR-0017          |
| CSRF: `SameSite=Lax` cookies                    | Backend sets, Browser enforces  | security             | cookie options in `auth.routes.ts`                            |
| CSRF: double-submit token check                 | Backend                         | security             | `requireCsrf`                                                 |
| CSRF: echoing the token                         | Frontend                        | plumbing             | `csrfInterceptor`                                             |
| CORS allowlist with credentials                 | Backend / Reverse proxy         | security             | `middleware/cors.ts`                                          |
| Same-origin policy                              | Browser                         | security             | -                                                             |
| Escaping interpolated values (XSS)              | Frontend (Angular)              | security, in-browser | every template                                                |
| Sanitising bound HTML/URLs (XSS)                | Frontend (Angular)              | security, in-browser | Angular's `DomSanitizer`; bypass banned by lint               |
| Content-Security-Policy for the app             | Reverse proxy, Browser enforces | security             | **not set** - see "What is not done"                          |
| CSP / nosniff / frame headers for the API       | Backend, Browser enforces       | security             | `middleware/security-headers.ts`                              |
| HSTS, TLS                                       | Reverse proxy                   | security             | not applicable to plain-HTTP local development                |
| Input validation (shape, length, format)        | Backend                         | security             | Zod schemas in `@ecm/contracts`, `parseOrThrow`               |
| Input validation in forms                       | Frontend                        | **UX**               | validators in `customer-form/`                                |
| File type/size/extension checks                 | Backend and Frontend            | security / UX        | `checkFile` in `@ecm/contracts`; ADR-0019                     |
| File content (signature) check                  | Backend                         | security             | `http/file-signature.ts`                                      |
| CSV formula-injection neutralising              | Backend                         | security             | `csvCell` in `files.routes.ts`                                |
| Open-redirect prevention on `returnUrl`         | Frontend                        | security, in-browser | `core/auth/return-url.ts`                                     |
| Raw backend errors never rendered               | Frontend                        | security (info leak) | error taxonomy, `core/errors/`                                |
| No secrets, tokens or passwords in logs         | Frontend and Backend            | security             | `requestLoggingInterceptor`, `redact()`, server error handler |
| Rate limiting                                   | Backend / Reverse proxy         | availability         | `middleware/rate-limit.ts` (fixed window, debt row 6)         |

"Security, in-browser" means the control protects the user of an unmodified
application from content or links _other people_ supplied - it is real, but it
is not a control over what the user themself can do.

---

## Authentication architecture

```text
 Browser                                   Mock API (the security boundary)
 ───────                                   ─────────────────────────────────
 LoginPage ── POST /api/auth/login ──────▶ verify user (password: not verified by the mock)
                                           create session: access (15 min), refresh (8 h), csrf
           ◀── 200 { user, expiresAt } ─── Set-Cookie: ecm_access  HttpOnly SameSite=Lax  Path=/
               + three Set-Cookie          Set-Cookie: ecm_refresh HttpOnly SameSite=Lax  Path=/api/auth/refresh
                                           Set-Cookie: ecm_csrf    (readable)  SameSite=Lax  Path=/
 SessionService: status=authenticated, user, permissions, expiresAt   ← no token, ever

 any request ── cookie ecm_access (sent by the browser) ─▶ requireAuth → requirePermission → handler
             ── x-csrf-token (unsafe methods) ───────────▶ requireCsrf
```

`SessionService` (`core/auth/session.service.ts`) is the client's whole view:

| State           | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| `unknown`       | not checked yet - a reload, before `GET /auth/session` answers |
| `anonymous`     | checked; nobody is signed in                                   |
| `authenticated` | signed in; `user`, `permissions` and `expiresAt` are known     |

`unknown` is why a reload does not bounce a signed-in user to the login page:
`authGuard` waits on `restore()` rather than treating "not yet known" as "no".
`restore()` treats only an `authentication` error as anonymous; a network
failure leaves the state `unknown` so a server hiccup is not a sign-out.

## Token lifecycle

```text
t=0        login            → access A1 (expires t+15m), refresh R1 (expires t+8h)
t<15m      requests         → A1 accepted
t≥15m      request          → 401 (A1 expired; browser may have dropped the cookie)
                              authRefreshInterceptor → SessionService.refresh()
           POST /refresh R1 → server rotates: A2, R2. R1 is now spent.
                              original request retried once with A2
           a replay of R1   → 401 (rotation: a stolen, already-used refresh token is worthless)
t≥8h       refresh fails    → session ends; ended$('expired') → /login?returnUrl=…&reason=expired
sign-out   POST /logout     → server destroys the session (by access token, or by CSRF token
                              when the access cookie is gone); cookies expired
```

The races around refresh - concurrent 401s, a 401 that arrives after a refresh
finished, a refresh whose trigger was cancelled - are handled explicitly and
tested one by one. ADR-0017 and `auth-refresh.interceptor.spec.ts`.

The access-token expiry (`expiresAt`) is reported by the server because the
client cannot read the cookie. It is informational: refresh is reactive, driven
by the server's 401, not by the client's clock.

## Authorization model

Roles grant permissions; code checks permissions (`@ecm/contracts`, `auth.ts`):

| Permission        | ADMIN | MANAGER | VIEWER |
| ----------------- | :---: | :-----: | :----: |
| `CUSTOMER_READ`   |   ✓   |    ✓    |   ✓    |
| `CUSTOMER_CREATE` |   ✓   |    ✓    |        |
| `CUSTOMER_UPDATE` |   ✓   |    ✓    |        |
| `CUSTOMER_DELETE` |   ✓   |         |        |
| `CUSTOMER_IMPORT` |   ✓   |    ✓    |        |
| `CUSTOMER_EXPORT` |   ✓   |    ✓    |        |

The server derives each user's permissions from the matrix and sends them in the
session response. The client **reads that list**; it never computes it.

Four levels, one of which is security (ADR-0018):

| Level   | Where                                          | What a bypass achieves                |
| ------- | ---------------------------------------------- | ------------------------------------- |
| Route   | `requirePermission()` on `customers.routes.ts` | an empty page whose calls are refused |
| UI      | `*appIfPermitted` on buttons and bulk actions  | a button whose call is refused        |
| Action  | `CustomerStore` refuses before sending         | a request the server refuses          |
| **API** | `requirePermission` middleware, every request  | **nothing - this is the boundary**    |

Proven without a UI: `apps/mock-api/test/authorization.spec.ts` calls the API as
each role; `e2e/auth.spec.ts` calls `DELETE` as a manager straight from the
test and gets 403.

## Interceptor responsibilities

`core/http/http.providers.ts` is the one place the chain is assembled, in this
order - one responsibility each:

| #   | Interceptor      | Responsibility                                          | Security-relevant because                            |
| --- | ---------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| 1   | `correlationId`  | stamp `X-Correlation-Id`, publish it on the context     | traces one failure across both processes             |
| 2   | `requestLogging` | time the request, log its outcome once                  | logs path only - no query string, body or headers    |
| 3   | `authRefresh`    | on `authentication`: one shared refresh, one retry      | never refreshes for the session endpoints themselves |
| 4   | `csrf`           | echo the CSRF cookie on unsafe **same-origin** requests | never sends the token to another origin              |
| 5   | `errorMapping`   | `HttpErrorResponse` → `AppError`                        | nothing downstream sees a raw server error           |

There is no interceptor that adds an `Authorization` header. The credential is a
cookie the browser attaches (ADR-0016).

## CSRF

Cookies are attached by the browser to any request to their site, including
one a hostile page triggers. Two layers:

1. **`SameSite=Lax`** on every session cookie (Backend sets, Browser enforces):
   a cross-site `POST`, `PATCH` or `DELETE` does not carry them. Lax rather than
   Strict so a link from an email to a customer record still arrives signed in.
2. **Double-submit token** (Backend checks): `ecm_csrf` is readable by
   same-origin script only; `csrfInterceptor` copies it into `x-csrf-token` on
   unsafe methods; `requireCsrf` compares cookie and header. A hostile page can
   make the browser send the cookie but cannot read it to fill in the header.

`GET` is never state-changing, so it is not checked. `/auth/logout` and
`/auth/refresh` are checked - a forced logout is a small denial of service, and
the test suite asserts it is refused.

## CORS

The application reaches the API **same-origin** - through the Angular dev proxy
locally and through a reverse proxy in production - so a browser never sends a
CORS request in normal use.

`apps/mock-api/src/middleware/cors.ts` exists for the case that is not normal:
it echoes `Access-Control-Allow-Origin` only for origins on an explicit list,
never `*` (which the browser forbids together with credentials), sets
`Vary: Origin`, and answers preflights before any route runs. In production this
belongs to the reverse proxy. CORS is enforced by the **browser** and protects
**other origins' users** - it is not access control, and a script outside a
browser ignores it entirely.

## XSS

What Angular does (Frontend, enforced in the browser):

- **Interpolation escapes.** `{{ customer.fullName }}` renders
  `<img src=x onerror=…>` as text. Asserted in `customer-detail-page.spec.ts`.
- **Property bindings are sanitised.** `[href]`, `[src]`, `[innerHTML]` pass
  through `DomSanitizer`, which strips `javascript:` URLs and script.
- **Templates are compiled ahead of time.** No template is built from user
  input at runtime.

What this repository adds:

- ESLint bans `bypassSecurityTrust*`, `innerHTML`/`outerHTML` assignment and
  `insertAdjacentHTML` in application code (`apps/web/eslint.config.js`). A
  future need is an inline disable with a reason a reviewer can see.
- No template binds `[innerHTML]` today.
- `returnUrl` is followed only when it is a path inside the application
  (`return-url.ts`); `javascript:`, `//evil.test`, `/\evil.test` and friends
  fall back to `/customers`.
- Raw server messages are never rendered; the error taxonomy maps every failure
  to a translation key.

What Angular cannot do: stop script that is already on the page - an injected
dependency, a malicious extension - from acting as the user. The defence
against **exfiltration** is that there is no token to steal (ADR-0016). The
defence against **injection** at the document level is a Content-Security-Policy
set by the server that serves `index.html`, which is not done yet.

## Input validation and output handling

| Where          | Validation                                                           | Owner                 |
| -------------- | -------------------------------------------------------------------- | --------------------- |
| Customer forms | required, format, length, cross-field, async email uniqueness        | Frontend - UX         |
| Every request  | the same Zod schema from `@ecm/contracts`, `parseOrThrow` → 422      | Backend               |
| Every response | validated against the contract before the application uses it        | Frontend - robustness |
| URL parameters | list criteria parsed against the contract's enums; invalid → ignored | Frontend - UX         |

Output handling: Angular escapes on render; the server returns JSON with
`nosniff`; the CSV export neutralises cells that a spreadsheet would evaluate
as formulas (`=`, `+`, `-`, `@`, tab, CR get a leading apostrophe) and quotes
cells containing separators; the import error report the browser builds does
the same, because its column names come from the user's own file; avatars are
served with their stored type, `nosniff` and `Content-Disposition: inline`. The
audit trail withholds the values of sensitive fields (date of birth) on the
server - the change is recorded, the values are never sent.

Realtime events travel on the same session cookie as every other request
(`GET /api/events` is behind `requireAuth`), carry identifiers and a customer
code but no customer data, and are validated against the contract before use.

## File upload security

ADR-0019. One policy in `@ecm/contracts` (`checkFile`, `AVATAR_FILE_POLICY`,
`IMPORT_FILE_POLICY`) run by both sides, and a content check only the server
makes:

| Check                                | Frontend            | Backend                             |
| ------------------------------------ | ------------------- | ----------------------------------- |
| not empty                            | `checkFile` - UX    | `checkFile` → 400                   |
| size ≤ limit (2 MB avatar, 5 MB CSV) | `checkFile` - UX    | multer limit + `checkFile` → 413    |
| extension by the last dot            | `checkFile` - UX    | `checkFile` → 415                   |
| declared MIME type on the allowlist  | `checkFile` - UX    | `checkFile` → 415                   |
| **bytes match the declared type**    | -                   | `detectImageType` → 415             |
| permission to upload                 | hidden control - UX | `requirePermission`, before parsing |

The client's check tells a user at once; it is not the boundary. Every rule is
enforced again by the server with the client out of the picture - the tests in
`apps/mock-api/test/files.spec.ts` upload an HTML page named `avatar.png`
declared as `image/png` and get 415.

SVG is not accepted as an avatar: to a browser it is a document that can carry
script.

## Sensitive data protection

- **No token in script-readable storage**, and no token in any response body.
- **No password in a URL.** Sign-in is a `POST`; the prerendered form's submit
  button is disabled until hydration so a pre-hydration press cannot fall back to
  a `GET` (Phase 2 finding). Asserted in `login-page.spec.ts`.
- **Logs**: the request log records method, path, status, duration and
  correlation id - never the query string (search terms are names and emails),
  a body or a header. `redact()` masks any field whose name contains `password`,
  `token`, `secret`, `authorization`, `apikey` or `cookie`. The server logs only
  5xx failures, with a stack and no body.
- **Sign-out discards customer data**: the customer store and cache are
  provided by the route and destroyed when the shell is left.
- **No credential in the repository.** The mock accepts any password for a known
  user precisely so that no fixture needs one.
- Account enumeration: an unknown user and a wrong password get the same
  response and the same client message.

## Secure cookie strategy

| Cookie        | `HttpOnly` | `SameSite` | `Path`              | Lifetime | Why                                        |
| ------------- | :--------: | :--------: | ------------------- | -------- | ------------------------------------------ |
| `ecm_access`  |     ✓      |    Lax     | `/`                 | 15 min   | the credential; unreadable by script       |
| `ecm_refresh` |     ✓      |    Lax     | `/api/auth/refresh` | 8 h      | sent only to the one endpoint that uses it |
| `ecm_csrf`    |            |    Lax     | `/`                 | 8 h      | must be readable to be echoed              |

`Secure` is on whenever `MOCK_API_SECURE_COOKIES=true` - off only for plain-HTTP
local development, where a `Secure` cookie would be dropped. In production it is
always on, and HSTS (reverse proxy) keeps the browser from ever trying HTTP.

## Cross-tab and offline (Phase 5)

- **A sign-out ends every tab.** The signing-out tab posts `signed-out` on the
  tab channel; the others end their local session and go to sign-in
  (docs/cross-tab.md). The server session was already gone - this is UX.
- **An expiry is not broadcast.** One tab's failed refresh must not end
  another tab's valid session.
- **Refresh runs under a Web Lock**, so two tabs never present the same
  single-use refresh token (debt row 18, paid). Rotation and replay detection
  on the server are unchanged.
- **Tab messages carry no data.** They say that something changed; each tab
  refetches through its own HTTP layer and the server's authorization. Every
  receiver validates the payload - another build of the application may be on
  the channel.
- **The service worker caches no API response** (ADR-0028), asserted by the
  production test suite. Cache Storage outlives the session and belongs to the
  next user of the browser.
- **The one piece of data kept for offline use** - the offline lab's snapshot -
  holds four fields, is tied to the user id, is never shown to another user,
  and is deleted when the session ends in a tab that opened the lab
  (ADR-0029). What remains after every such tab is closed is stated in
  docs/offline.md.
- **The rendering specimens are public** (`/rendering-lab/*`) so the server can
  render them without a session. They contain generated rows only, and
  `noindex` (ADR-0026).

## What is not done

Stated here so that nothing above reads as more than it is.

| Gap                                                                                                                       | Why it is acceptable here                                                                                          | Owner / phase                         |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| The mock does not verify passwords                                                                                        | no credential in the repository; ADR-0007                                                                          | a real backend                        |
| No Content-Security-Policy on the application document                                                                    | Angular's inline styles and event-replay script need nonces; that belongs with the server that serves `index.html` | Reverse proxy - Phase 7 (debt row 17) |
| No brute-force protection on sign-in beyond the global rate limit                                                         | the mock verifies no password to guess                                                                             | a real backend                        |
| Images are signature-checked, not decoded and re-encoded; no malware scan; user content not served from a separate origin | stated rather than implied                                                                                         | a real backend                        |
| A sign-out that never reaches the server leaves the server session alive until it expires                                 | `HttpOnly` cookies cannot be deleted from script                                                                   | inherent to ADR-0016                  |
| Dependency vulnerability scanning                                                                                         | no pipeline yet                                                                                                    | Phase 7                               |
