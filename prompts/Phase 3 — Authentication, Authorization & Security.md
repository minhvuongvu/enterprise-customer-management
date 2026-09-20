Continue working on the existing Angular enterprise learning repository.

This is Phase 3.

## Objective

Implement realistic authentication, authorization, session management, and frontend security architecture.

Do not treat frontend authorization as a security boundary. The mock backend must enforce authorization independently.

## Authentication

Implement:

- login
- logout
- current-user state
- authentication state
- session expiration
- access token
- refresh token
- token refresh
- failed refresh handling

Use a realistic architecture.

Do not expose sensitive credentials in source code.

## Route Protection

Protect:

/customers
/customers/new
/customers/:id
/customers/:id/edit
/customers/:id/audit

Demonstrate route guards.

Use functional guards where appropriate.

## Authorization

Roles:

ADMIN
MANAGER
VIEWER

Permissions should be represented separately from roles where useful.

Example permissions:

CUSTOMER_READ
CUSTOMER_CREATE
CUSTOMER_UPDATE
CUSTOMER_DELETE
CUSTOMER_EXPORT
CUSTOMER_IMPORT

Demonstrate:

- route authorization
- UI authorization
- action authorization

The backend mock must also enforce permissions.

## HTTP Interceptors

Implement appropriate interceptors for:

- authentication
- correlation ID
- error handling
- request timing/logging

Avoid putting unrelated responsibilities into a single interceptor.

## Session Expiration

When the access token expires:

1. attempt refresh
2. queue/retry appropriate requests
3. avoid multiple simultaneous refresh calls
4. if refresh fails, clear session
5. redirect to login
6. preserve intended destination when appropriate

Explicitly handle race conditions.

## Security

Demonstrate:

- Angular XSS protections
- safe rendering
- input validation
- output handling
- file validation
- sensitive data protection
- CSRF strategy
- secure cookie strategy
- CORS strategy

Clearly document which protections belong to:

Frontend
Backend
Browser
Reverse proxy / server

Do not falsely claim that Angular alone can implement server-side security controls.

## File Upload Security

Validate:

- extension
- MIME type
- file size

Do not trust client validation as the final security boundary.

Mock backend must validate independently.

## Testing

Add tests for:

- login
- logout
- auth guard
- permission guard
- token refresh
- refresh race condition
- expired session
- unauthorized action
- unauthorized route
- file validation

Add E2E tests for:

login
→ protected route
→ permission-based UI
→ logout

## Documentation

Create/update:

docs/security.md

Document:

- authentication architecture
- authorization model
- token lifecycle
- interceptor responsibilities
- frontend vs backend security boundary
- CSRF
- CORS
- XSS
- file upload security

After implementation run all available checks and report results.

---

## Definition of Done

Do not report this phase as complete until every item holds. Report any failing item as failing, with its output. Never mark a phase done with a known-broken check.

- [ ] `npm run format` clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` clean under `strict` + `strictTemplates`
- [ ] `npm run test` passing, meaningful assertions, no `.skip` left behind
- [ ] `npm run build` succeeds, including the server build
- [ ] `npm run e2e` passing
- [ ] The non-negotiable rules in `CLAUDE.md` hold for all new code
- [ ] No circular dependencies introduced
- [ ] No later-phase scope implemented, and no unrelated refactoring
- [ ] The mock API rejects unauthorized requests independently — proven by a test that bypasses the UI entirely
- [ ] Concurrent 401s trigger exactly one refresh call — proven by a race-condition test
- [ ] Failed refresh clears the session, redirects to login, and preserves the intended destination
- [ ] Token storage choice is justified in an ADR; no token is placed in `localStorage` without that justification
- [ ] Each interceptor has one responsibility; ordering is documented
- [ ] `docs/security.md` states, per control, whether it belongs to the frontend, backend, browser, or reverse proxy
- [ ] No claim anywhere that a frontend-only mechanism provides a security guarantee
- [ ] No secret, token or password appears in logs or in the repository
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-3` and tagged
