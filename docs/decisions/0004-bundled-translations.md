# ADR-0004 — Translations are lazily imported chunks, not HTTP requests

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0

## Problem

Transloco's default loader fetches `/assets/i18n/<lang>.json` over HTTP. With server
rendering enabled (ADR-0003), that means the renderer issues an HTTP request to the
application's own static files while producing HTML — a process asking itself for a
file that is sitting on its own disk. It needs an absolute URL, it fails during
prerendering unless a server is already listening, and it produces a class of "works
in dev, breaks in the build" errors that costs hours the first time.

## Options considered

### A. Transloco's HTTP loader, with a separate server loader

Two implementations behind `TRANSLOCO_LOADER`: `HttpClient` in the browser, file
system access on the server.
Pros: standard setup in the browser; teaches the platform boundary.
Cons: two loaders to keep in sync, a file-system path that must survive bundling, and
a bug in either only shows on one platform.

### B. Load each language with a dynamic `import()`

Pros: one implementation that works identically in the browser and in Node; the
bundler emits a separate chunk per language, so only the active language is
downloaded; no HTTP, so no SSR problem and no request to fail.
Cons: adding a language means editing a map, not just dropping a file in a folder;
translations are versioned with the bundle, so fixing a typo needs a deploy.

### C. `@angular/localize`

Rejected by ADR-0001: it compiles one bundle per locale and cannot switch language at
runtime, which §3.11 requires.

## Decision

Option B. `BundledTranslationLoader` holds a map from language code to
`() => import('./translations/<lang>.json')`.

## Reason

The cons of B are small and the cons of A are the expensive kind. "Adding a language
means editing a map" is a one-line change that the type system will point at; a
desynchronised pair of loaders is a bug that only appears in one environment.

Shipping translations with the bundle is also the honest description of how this
application is deployed. Nothing here updates translations independently of a release,
so a loading mechanism built for that capability would be paying for something unused.

Verified in Phase 0: the production build emits `en-json` as a lazy chunk for both the
browser and the server bundle, and the prerendered `/login` page renders translated
text.

## Consequences

- Phase 6 adds Vietnamese with one JSON file plus one entry in the map.
- Runtime language switching still works: switching triggers the dynamic import for
  the new language.
- Translations cannot be changed without a deployment. If that ever becomes a real
  requirement, this is the decision to revisit — not the i18n library.
- No HTTP request means no failure mode to handle at startup for translations.

## Revisit when

- Translations need to be editable by non-developers between releases, or come from a
  translation-management platform.
- The number of languages grows enough that the chunk map becomes tedious to maintain
  by hand.
