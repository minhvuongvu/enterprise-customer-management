# ADR-0021 — Uploads that report progress travel on XHR; everything else stays on fetch

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 4

## Problem

The avatar upload and the CSV import must show upload progress and be
cancellable. The application's HTTP transport is `fetch` (`withFetch()`,
`http.providers.ts`) because server-side rendering is built around it.
`fetch` has no upload-progress event, and Angular 22's `FetchBackend` throws
(`NG02824`) when a request asks for `reportUploadProgress`.

## Options considered

### A — Switch the whole application to `withXhr()`

- Pros: one transport; upload progress everywhere.
- Cons: reverses a Phase 0 decision for every request to serve two, and XHR on
  the server needs a polyfill the SSR build does not have.

### B — A second `HttpClient` for uploads

- Pros: nothing else changes.
- Cons: a second client would bypass the interceptor chain - no CSRF header, no
  refresh, no error mapping - or duplicate it. Uploads are writes, and need all
  of it.

### C — Fake progress

- Cons: a progress bar that is not measuring anything is a lie the user will
  notice on the first slow connection.

### D — Route per request, below the interceptors (chosen)

A custom `HttpBackend`, `UploadAwareBackend`, hands a request to Angular's
`HttpXhrBackend` when it asks for `reportUploadProgress`, and to `FetchBackend`
otherwise.

## Decision

Option D. It replaces the `HttpBackend` that `withFetch()` registered; the
interceptor chain above it is unchanged, so an upload carries a correlation id,
a CSRF header, is renewed on an expired session and has its failure mapped,
like any other request. Cancelling unsubscribes, which calls `xhr.abort()`:
the bytes stop.

Download progress (the export) stays on `fetch`, which supports it.

## Consequences

- Upload requests are made with `observe: 'events'` and
  `reportUploadProgress: true`; `customers/data/transfer.ts` narrows the
  resulting `HttpEvent`s to `progress | done` at the API boundary.
- File transfers carry no timeout policy: a user who can see progress and press
  cancel is a better judge than a timer sized for JSON.
- Tested at the unit level (`upload-aware.backend.spec.ts`), and end to end: the
  E2E suite cancels an upload and observes the request fail in the browser.

## Revisit when

- `fetch` gains upload progress in all target browsers (request streams with
  progress), or Angular's `FetchBackend` supports it;
- a second kind of request needs XHR for another reason.
