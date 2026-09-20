# ADR-0005 — Runtime configuration is a browser concern

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 0

## Problem

Phase 0 must provide both build-time and runtime configuration. Runtime configuration
exists so that one tested artifact can be promoted from staging to production without
being rebuilt — what differs is fetched at startup.

Server rendering complicates this. An app initializer runs on the server too, and
fetching `/config.json` there means the renderer requesting a file it is already
serving.

## Options considered

### A. Fetch `/config.json` on both platforms

Cons: the server needs an absolute URL to itself, the request can fail during
prerendering when nothing is listening, and it adds a network round trip to every
rendered response.

### B. Read the file from disk on the server, fetch it in the browser

Pros: one configuration source, honoured everywhere.
Cons: a bundled server reading a path relative to its own output is fragile; it is a
second code path that only fails in production.

### C. Embed the configuration into the rendered HTML and read it back via

`TransferState`

Pros: no second fetch after hydration; genuinely one source.
Cons: the prerendered route is built once, so whatever is embedded is frozen at build
time — which defeats the purpose of runtime configuration for exactly the route that
uses SSR.

### D. Compiled-in defaults on the server; fetch and override in the browser

Pros: simple, no server-side file access, no startup failure mode that blocks
rendering.
Cons: the prerendered page is rendered with defaults, so a deployment-specific value
only applies after hydration.

## Decision

Option D. `provideRuntimeConfig()` returns immediately on the server. In the browser
it fetches `/config.json`, merges the result over `DEFAULT_APP_CONFIG`, and falls back
to the defaults with a logged warning if the file is missing or malformed.

`DEFAULT_APP_CONFIG` is a complete, working configuration, not a stub.

## Reason

Option D is coherent with ADR-0003 rather than fighting it. The only server-rendered
route is `/login`, which is public and static; it has nothing deployment-specific to
say. Everything that reads configuration meaningfully — API base URL, feature flags —
runs in the authenticated application, which is client-rendered.

Defaults that actually work matter more than they look: a deployment that forgets to
mount `config.json` should start and log a warning rather than show a blank page.
A configuration loader that can prevent the app from booting is a new outage cause.

## Consequences

- The boundary must be documented, or it reads like an oversight. It is stated in the
  source and in `docs/architecture.md`.
- Anything genuinely needed during server rendering must go in `BuildEnvironment`
  instead, and that is the rule for choosing between the two.
- `config.json` is served to every browser, so nothing secret can ever go in it. Noted
  in the source next to the type.
- Phase 7's feature-flag work extends `AppConfig.features`; no new mechanism needed.

## Revisit when

- An authenticated route is switched to server rendering and needs per-deployment
  configuration while rendering.
- Configuration has to change without a page reload, which this design does not
  support.
