# ADR-0012 — Phase 2 borrows a session, and states exactly what it did not borrow

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 2

## Problem

Every customer endpoint on the mock API sits behind `requireAuth`, and every
unsafe method behind a CSRF check. That was a deliberate Phase 0.5 decision
(ANGULAR_PROJECT_CONTEXT.md 5.4: the mock is a real server, so the security
mechanisms are real rather than simulated).

Phase 3 owns authentication. Phase 2 owns customer data. The two collide: a
phase about reading and writing customers cannot run at all without a session,
and `authGuard` still returns `true` with a comment saying Phase 3 will fix it.

So the question is not _whether_ Phase 2 touches authentication. It is **how
little it can touch, and how to stop that little from quietly becoming Phase
3's work done badly a phase early.**

## Options considered

### Option A — Relax the mock API for Phase 2

Make the customer routes public and re-secure them in Phase 3.

- Pros: no authentication code in Phase 2 at all.
- Cons: throws away the property the mock exists to have. Every Phase 2 test
  would then prove something about an API that does not resemble the one Phase
  3 restores, and the 401 path - which the list page has to handle - would be
  unreachable.

### Option B — Sign in from the test suite only

Leave the application with no sign-in, and have the E2E fixture call
`/api/auth/login` directly.

- Pros: not one line of authentication in the application.
- Cons: `npm start` produces an application a person cannot use. A learning
  repository whose main screen only works from a test runner teaches the wrong
  thing about what "done" means.

### Option C — Implement authentication now

- Pros: the phases stop overlapping.
- Cons: it is Phase 3's entire subject - refresh, rotation, expiry, guards,
  role-based UI - and doing it here means doing it without the phase that was
  designed to think about it.

## Decision

Option B for the bulk of the suite, plus the **smallest possible** piece of
Option C so the application works by hand: three things, and nothing else.

1. **`SessionApi`** - `POST /auth/login` and `GET /auth/session`, validated
   against the contract like every other client.
2. **`SessionService.signIn()`** - fills in one method of the seam Phase 0
   declared. It records who is signed in. It does not refresh, expire, or log
   out.
3. **`csrfInterceptor`** - echoes the readable CSRF cookie on unsafe,
   same-origin requests. Without it every mutation in this phase is a 403.

The sign-in page is a form with two fields that says in its own copy that it is
a placeholder.

### What Phase 2 deliberately did **not** do

- `authGuard` still returns `true`. A 401 surfaces as an error state with a
  link to sign in, not as a redirect.
- No refresh, no rotation, no expiry handling, no logout.
- No permission model, no role-aware UI, no hiding of actions the server would
  refuse. The mock already enforces all of it; the client simply reports what
  it is told.

## Reason

The line is drawn at **"can a request be made at all"** versus **"what happens
to a session over time"**. The first is transport plumbing that data access
cannot function without. The second is a subject with its own failure modes,
and it is what Phase 3 is for.

Drawing it anywhere else produces one of the two failures this repository is
supposed to avoid: an API that is easier than the real thing, or a phase that
quietly does the next phase's work and leaves nothing to learn from.

## Consequences

- Phase 3 rewrites `login-page.ts` and fills in the rest of `SessionService`.
  Nothing it needs has been foreclosed, and `csrfInterceptor` is finished work
  it can keep.
- The customer list must handle `authentication` as one of its error kinds -
  which it should anyway, because a session can end mid-session.
- The E2E suite signs in through the API in a fixture, and through the form in
  exactly one test. The form is therefore covered without every other test
  paying for it.
- The sign-in page is prerendered, which produced a real defect worth recording:
  a submit button pressed before hydration submits the form the way a browser
  does without JavaScript - a GET that puts the password in the address bar.
  The button is disabled until the application is live. See `login-page.ts`.

## Revisit when

Phase 3 starts. This ADR is a statement of scope, not of design; Phase 3 should
supersede it with a real authentication ADR rather than extend it.
