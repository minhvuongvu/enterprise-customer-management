# Mock backend

`apps/mock-api` — a real Express server that stands in for the backend.

> **Development only.** This server does not verify passwords, exposes unauthenticated
> control endpoints under `/api/_mock`, and keeps everything in memory. It must never be
> deployed anywhere.

Why a real server rather than an Angular interceptor is settled in
`ANGULAR_PROJECT_CONTEXT.md` §5.4; how it is built, in ADR-0007.

---

## 1. Running it

```bash
npm run start:api          # http://localhost:4300, restarts on change
npm start                  # the app, proxying /api to the API
npm run e2e                # starts both itself
```

No build step: Node 24 runs the TypeScript directly (ADR-0007). Two constraints follow,
and both are commented where they bite:

- **no constructor parameter properties** — `constructor(private readonly x: T)` is
  rejected by Node's strip-only mode;
- **no `enum` and no `namespace`** in code that Node loads (`.d.ts` is fine);
- relative imports must carry a literal `.ts` extension.

### Configuration

| Variable                  | Default                 |                                                         |
| ------------------------- | ----------------------- | ------------------------------------------------------- |
| `MOCK_API_PORT`           | `4300`                  |                                                         |
| `MOCK_API_SEED`           | `20260920`              | Changes the dataset                                     |
| `MOCK_API_CUSTOMERS`      | `50000`                 |                                                         |
| `MOCK_API_LATENCY_MS`     | `120`                   | Artificial delay                                        |
| `MOCK_API_JITTER_MS`      | `80`                    | Random extra delay                                      |
| `MOCK_API_ERROR_RATE`     | `0`                     | Percent of requests failed randomly                     |
| `MOCK_API_CORS_ORIGINS`   | `http://localhost:4200` | Comma-separated. Never `*`                              |
| `MOCK_API_ACCESS_TTL`     | `900`                   | Seconds                                                 |
| `MOCK_API_REFRESH_TTL`    | `28800`                 | Seconds                                                 |
| `MOCK_API_RATE_LIMIT`     | `600`                   | Requests per minute per IP                              |
| `MOCK_API_SECURE_COOKIES` | `false`                 | `Secure` flag — a Secure cookie is dropped over http:// |

The latency default is not decoration. A mock that answers in a millisecond hides every
loading state, race and cancellation bug the frontend is supposed to handle.

---

## 2. Data

Generated from a seed with a small deterministic PRNG. `Math.random()` is used for
latency jitter and nowhere else.

The same seed always produces the same 50,000 customers, byte for byte — proven by a
test. That is what makes "customer C-000042" mean the same thing on two machines, and a
failing test re-runnable with the data that broke it. The generator is also
_prefix-stable_: the first 300 records of a 300-record dataset are identical to the
first 300 of a 50,000-record one, so a bug found with a small dataset reproduces with
the large one.

The data is deliberately untidy, because tidy data hides bugs:

- non-ASCII names (`Nguyễn`, `Đức`, `Kraków`, `O'Brien`) — where sorting, collation and
  layout break;
- `phone`, `address` and `dateOfBirth` empty for some records;
- repeated names, so "search by name" returns more than one row;
- a realistic status mix rather than a uniform one.

Emails and customer codes are unique by construction, so the duplicate-email conflict
stays reachable and testable.

**Everything is in memory.** A restart rebuilds the dataset and signs everyone out.
`POST /api/_mock/reseed` does the same without a restart.

---

## 3. Fault injection

Send `x-mock-scenario: <name>`. The catalogue is served from `/api/_mock/scenarios`, so
this table cannot drift from the code — a test asserts they match.

Random failure exists (`MOCK_API_ERROR_RATE`) for demonstrating resilience by hand. It
is off by default and no test uses it: a suite that fails once a week for no reason
teaches people to rerun rather than to read.

### Applied before routing

| Scenario            | Effect                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| `slow`              | Adds 3 seconds, then succeeds                                                |
| `server-error`      | `500 INTERNAL_ERROR`                                                         |
| `network-drop`      | Destroys the connection — no status at all, which is what offline looks like |
| `unauthorized`      | `401`                                                                        |
| `forbidden`         | `403`                                                                        |
| `not-found`         | `404`                                                                        |
| `validation-error`  | `422` with a sample field error                                              |
| `rate-limit`        | `429` with `Retry-After: 30`                                                 |
| `payload-too-large` | `413`                                                                        |

### Applied by the handler

| Scenario                 | Effect                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| `conflict`               | A versioned write fails `409` as though another user had just saved   |
| `invalid-credentials`    | Login fails `401` even for a known username                           |
| `expired-session`        | The access token is treated as expired; the refresh token still works |
| `partial-bulk-failure`   | Every second id in a bulk request fails                               |
| `import-partial-failure` | Every third CSV row fails validation                                  |

An unknown scenario name is a `400`, not a silent pass. A typo in a test must fail
loudly; ignoring it produces a green test that proves nothing.

### Control endpoints

| Method          | Path                   |                                               |
| --------------- | ---------------------- | --------------------------------------------- |
| `GET`           | `/api/_mock/scenarios` | The catalogue above                           |
| `GET` / `PATCH` | `/api/_mock/controls`  | Latency, jitter, random error rate            |
| `POST`          | `/api/_mock/reseed`    | `{ seed?, count? }`                           |
| `POST`          | `/api/_mock/notice`    | Publishes a `system.notice` on the SSE stream |

Unauthenticated on purpose: tests use them to arrange state before signing in. They are
absent from `@ecm/contracts`, so the application has no typed way to reach them.

---

## 4. Security: what is real, and whose job it is

This is the part a frontend-only mock cannot provide, and the reason §5.4 requires a
real server. Everything in the "Mock API" column is genuinely implemented and covered by
tests that call the API directly, with no browser involved.

| Control               | Frontend                                               | Mock API                                                                                      | Browser                                                | Reverse proxy / CDN (production)                         |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| **Authentication**    | Sends the request; reacts to `401`                     | **Issues and validates the session.** The boundary                                            | Stores the cookie, will not let script read `HttpOnly` | TLS termination                                          |
| **Authorization**     | Hides actions the user cannot perform — _UX only_      | **Checks the permission on every request.** The boundary                                      | —                                                      | —                                                        |
| **Session cookie**    | Cannot read it                                         | Sets `HttpOnly`, `SameSite=Lax`, `Secure` when configured                                     | Enforces the flags                                     | Enforces `Secure` by serving HTTPS                       |
| **CSRF**              | Echoes `ecm_csrf` in `x-csrf-token`                    | **Compares them; rejects a mismatch**                                                         | Blocks cross-origin reads of the cookie                | —                                                        |
| **CORS**              | —                                                      | **Echoes an allow-listed origin, never `*` with credentials**                                 | Enforces the policy                                    | Usually owns this in production                          |
| **Security headers**  | —                                                      | Sets `nosniff`, `X-Frame-Options`, `Referrer-Policy`, a restrictive CSP, `Permissions-Policy` | Enforces them                                          | **Owns them in production**, including the app's own CSP |
| **HSTS**              | —                                                      | Not set — meaningless over plain HTTP                                                         | —                                                      | **Only here**                                            |
| **Upload validation** | Checks type and size for fast feedback — _convenience_ | **Checks them again with the same `checkFile`, then the file's first bytes.** The rule        | —                                                      | Size limits at the edge                                  |
| **Rate limiting**     | —                                                      | Fixed-window per IP                                                                           | —                                                      | Usually here in production                               |
| **Input validation**  | Validates for the user's benefit                       | **Validates with the same schema for the system's benefit**                                   | —                                                      | —                                                        |

Two things this table is careful about:

1. **The frontend is never the boundary.** Its permission checks decide what to show.
   Every one of them is repeated here, and the authorization tests prove it by using a
   VIEWER session against the API with no UI in the picture.
2. **Declared MIME type is a claim, not proof.** Since Phase 3 the server checks the
   name, the declared type and the size with the shared `checkFile` policy, and then
   the file's **first bytes** against the declared type - an HTML page named
   `avatar.png` and sent as `image/png` is refused with 415. SVG is refused because
   it can carry script. A production backend would go further - decode and re-encode
   the image, scan it, serve user content from a separate origin. This one does not,
   and saying so is more useful than implying otherwise (ADR-0019).

The full per-control ownership table, including the application's side, is
[`security.md`](security.md).

### What is deliberately not real

|                                 | Why                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password verification           | Storing a credential in a fixture is how real ones leak. The `invalid-credentials` scenario provides the failure path deterministically              |
| Opaque tokens, not JWTs         | Signing and claim parsing would change nothing the frontend deals with, and invite the "JWT in localStorage" pattern this project avoids             |
| Signature check only on uploads | A real backend would also decode and re-encode images and serve them from a separate origin (ADR-0019)                                               |
| Fixed-window rate limiting      | A client can send up to twice the limit across a window boundary. Naming the flaw is more useful than hiding it behind a sliding window nobody reads |
| In-memory sessions              | A restart signs everyone out — which makes the expired-session path easy to exercise by hand                                                         |

---

## 5. Layout

```text
apps/mock-api/src/
├── main.ts            entry point
├── app.ts             builds the app; exported so tests get a real server
├── config.ts          fixed configuration + the mutable MockControls
├── domain/
│   ├── seed.ts        deterministic generation
│   ├── store.ts       the dataset, its indexes, audit and events
│   └── sessions.ts    opaque tokens, rotation, expiry
├── http/              ApiError, schema validation, path params
├── middleware/        correlation id, CORS, security headers, faults, latency,
│                      rate limit, auth/CSRF, error handler
└── routes/            auth, customers, files, events, admin
```

Middleware order is significant and is listed, with its reasons, in `app.ts`. The two
that matter most: the correlation id is first so everything after it is traceable, and
fault injection sits before the real work so an injected failure costs nothing.

---

## 6. Tests

`npm run test --workspace @ecm/mock-api` — 101 tests over 8 files.

They run against the **real server on an ephemeral port**, not against handlers invoked
in process. Cookies, CORS, status codes and streaming are what this server exists to
provide, and none of them are exercised by calling an Express handler directly.

| File                      | Covers                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `status-codes.spec.ts`    | Every documented status is reachable; every error body validates against the envelope |
| `customers.spec.ts`       | Paging, sorting, filtering, search, CRUD, versioning, audit, bulk                     |
| `authorization.spec.ts`   | The role matrix, enforced server-side with no UI involved                             |
| `auth.spec.ts`            | Cookie flags, CSRF, refresh rotation and replay, expiry                               |
| `fault-injection.spec.ts` | Every published scenario does what it claims                                          |
| `seed.spec.ts`            | Determinism, prefix stability, data realism                                           |
| `files.spec.ts`           | Upload, type rejection, CSV partial import, export                                    |
| `events.spec.ts`          | SSE wire format, event ids, changed-field payloads                                    |
