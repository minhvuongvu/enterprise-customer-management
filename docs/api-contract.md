# API contract

The shape of the API, as defined by `packages/contracts`.

That package is the single definition. Every schema there is both a runtime validator
and the source of its TypeScript type, and both the application and the mock API import
it. There is no second, hand-written copy of any of these types — if one appears, the
two will disagree, and the wrong one will be the one nobody is looking at.

---

## 1. Conventions

|                |                                                                             |
| -------------- | --------------------------------------------------------------------------- |
| Base path      | `/api`                                                                      |
| Encoding       | JSON, UTF-8. Uploads are `multipart/form-data`; export is `text/csv`        |
| Instants       | UTC ISO-8601 with no offset: `2026-09-20T04:15:00.000Z`                     |
| Calendar dates | `1990-01-01`, no time, no zone — never converted through a `Date`           |
| Correlation    | `x-correlation-id`, sent by the client, echoed on the response              |
| Authentication | `HttpOnly` session cookie                                                   |
| CSRF           | `x-csrf-token` header echoing the `ecm_csrf` cookie, on every unsafe method |

Instants and calendar dates are separate branded types. Mixing them is a compile error,
which is the point: a birthday is not a moment, and `new Date('1990-01-01')` in a
negative UTC offset silently returns the day before.

---

## 2. Error envelope

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Invalid customer.",
    "correlationId": "2f1c…",
    "details": { "fieldErrors": { "address.city": ["Required"] } }
  }
}
```

- `code` is machine-readable and stable. The client maps it to a translated message.
- `message` is **developer-facing**. The application must never render it — §4.7 forbids
  showing raw backend errors, and `mapHttpError` does not read it.
- `correlationId` echoes the request's, so both sides' logs join on one value.
- `details` is present only where it means something.

### Codes and statuses

One code, one status, always.

| Code                     | Status | Means                                                                              |
| ------------------------ | ------ | ---------------------------------------------------------------------------------- |
| `BAD_REQUEST`            | 400    | Malformed request the schemas could not even reach                                 |
| `UNAUTHENTICATED`        | 401    | No session, or the access token expired — _signing in helps_                       |
| `FORBIDDEN`              | 403    | Authenticated but not permitted, or CSRF failed — _signing in again does not help_ |
| `NOT_FOUND`              | 404    | No such resource or endpoint                                                       |
| `CONFLICT`               | 409    | Duplicate email, or a stale write. `details.currentVersion` when versioned         |
| `PAYLOAD_TOO_LARGE`      | 413    | Upload or import beyond the limit                                                  |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | File type not allowed                                                              |
| `VALIDATION_FAILED`      | 422    | Well-formed but invalid. `details.fieldErrors`                                     |
| `RATE_LIMITED`           | 429    | `details.retryAfterSeconds` and a `Retry-After` header                             |
| `INTERNAL_ERROR`         | 500    | Unexpected                                                                         |

`fieldErrors` keys are **dotted paths** — `address.city`, not `address` — so a form can
mark the exact control. Errors belonging to the payload as a whole (an unknown key, a
failed cross-field rule) are collected under `_`.

---

## 3. Endpoints

### Authentication

| Method | Path                | Permission | Notes                                                    |
| ------ | ------------------- | ---------- | -------------------------------------------------------- |
| `POST` | `/api/auth/login`   | —          | Sets `ecm_access`, `ecm_refresh`, `ecm_csrf`             |
| `POST` | `/api/auth/refresh` | session    | Rotates both tokens; a replayed refresh token is refused |
| `GET`  | `/api/auth/session` | session    | Current user and permissions                             |
| `POST` | `/api/auth/logout`  | session    | Clears the cookies                                       |

### Customers

| Method   | Path                       | Permission          | Notes                               |
| -------- | -------------------------- | ------------------- | ----------------------------------- |
| `GET`    | `/api/customers`           | `CUSTOMER_READ`     | Paged, sorted, filtered — see below |
| `GET`    | `/api/customers/:id`       | `CUSTOMER_READ`     |                                     |
| `POST`   | `/api/customers`           | `CUSTOMER_CREATE`   | `201` + `Location`                  |
| `PATCH`  | `/api/customers/:id`       | `CUSTOMER_UPDATE`   | Requires `version`                  |
| `DELETE` | `/api/customers/:id`       | `CUSTOMER_DELETE`   | `204`                               |
| `POST`   | `/api/customers/bulk`      | depends on `action` | Always `200`, per-item outcomes     |
| `GET`    | `/api/customers/:id/audit` | `CUSTOMER_READ`     | Newest first                        |

### Files

| Method | Path                        | Permission        | Notes                                    |
| ------ | --------------------------- | ----------------- | ---------------------------------------- |
| `POST` | `/api/customers/:id/avatar` | `CUSTOMER_UPDATE` | multipart `file`; ≤2 MB; png/jpeg/webp   |
| `GET`  | `/api/customers/:id/avatar` | `CUSTOMER_READ`   | `nosniff`, `Content-Disposition: inline` |
| `POST` | `/api/customers/import`     | `CUSTOMER_IMPORT` | CSV; ≤5 MB, ≤5000 rows                   |
| `GET`  | `/api/customers/export`     | `CUSTOMER_EXPORT` | CSV, same filters as the list            |

### Realtime and health

| Method | Path          | Permission | Notes                         |
| ------ | ------------- | ---------- | ----------------------------- |
| `GET`  | `/api/events` | session    | Server-sent events — ADR-0006 |
| `GET`  | `/api/health` | —          | Liveness, dataset size, seed  |

`/api/_mock/*` exists only in the mock. It is deliberately **not** described in
`@ecm/contracts`, so the application has no typed way to depend on it. See
`docs/mock-backend.md`.

---

## 4. Listing

```
GET /api/customers?page=2&size=20&sort=updatedAt,desc&search=john&status=ACTIVE
                  &gender=FEMALE&createdFrom=2024-01-01&createdTo=2024-12-31
```

| Parameter                  | Default          | Notes                                                            |
| -------------------------- | ---------------- | ---------------------------------------------------------------- |
| `page`                     | `1`              | 1-based, because it appears in URLs people read                  |
| `size`                     | `20`             | Max 100                                                          |
| `sort`                     | `updatedAt,desc` | `field,asc\|desc`. Unknown field → `422`, never silently ignored |
| `search`                   | —                | Matches name, email or customer code                             |
| `status`, `gender`         | —                | Exact match                                                      |
| `createdFrom`, `createdTo` | —                | Calendar dates, both inclusive                                   |

Response:

```json
{ "items": [ … ], "page": 2, "size": 20, "totalItems": 50000, "totalPages": 2500 }
```

`totalItems` costs the server a count and is included anyway: a list that cannot say
how much there is cannot render "page 2 of 2500".

---

## 5. Optimistic concurrency

Every customer carries a `version`, incremented by the server on each write.

`PATCH` **requires** the version the client last saw. If it no longer matches, the write
is refused with `409` and `details.currentVersion`:

```
User A loads C-000042 (version 4)
User B loads C-000042 (version 4), saves    → version 5
User A saves with version 4                  → 409, currentVersion: 5
```

The version is required rather than optional because an update that does not say what it
is based on cannot be checked — and silently overwriting a colleague's edit is the exact
failure this prevents. Phase 4 builds the UI that lets User A see what changed.

Bulk operations do not take a version: they set a status rather than replace a record,
and demanding a version per item would make the request unusable.

---

## 6. Roles and permissions

|                   | ADMIN | MANAGER | VIEWER |
| ----------------- | ----- | ------- | ------ |
| `CUSTOMER_READ`   | ✓     | ✓       | ✓      |
| `CUSTOMER_CREATE` | ✓     | ✓       |        |
| `CUSTOMER_UPDATE` | ✓     | ✓       |        |
| `CUSTOMER_DELETE` | ✓     |         |        |
| `CUSTOMER_IMPORT` | ✓     | ✓       |        |
| `CUSTOMER_EXPORT` | ✓     | ✓       |        |

Permissions are modelled separately from roles because that is the distinction that
survives contact with reality: roles grant access, permissions are what code checks. A
feature asks "may this user delete a customer", never "is this user an ADMIN".

MANAGER's missing `CUSTOMER_DELETE` is deliberate. It gives the UI a permission gap to
express — an action that exists and is refused — rather than a role that simply has
fewer screens.

**The server checks the permission on every request**, regardless of what the client
believed. The application's own checks decide what to _show_; this decides what is
_allowed_.

---

## 7. Versioning the contract

The contract and both consumers are in one repository and are released together, so
there is no negotiated version number. The rule that replaces it:

1. **Additive change** (a new optional field, a new endpoint) — change the schema, ship.
2. **Breaking change** (a field removed, a type narrowed, a required field added) —
   change the schema and every consumer in the same commit. The compiler finds them; a
   type error at a call site is the intended outcome, not an obstacle.
3. **The mock must not be more permissive than the contract.** Every request body and
   query string is parsed with the published schema, so an endpoint cannot quietly
   accept something the contract forbids — which is how a frontend comes to depend on
   behaviour that a real backend will reject.

If this ever needs a real version negotiation, that is a change to the deployment model,
not to this file.
