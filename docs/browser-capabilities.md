# Browser capabilities

Browser APIs the application uses or demonstrates, how each is reached, and
what each costs. The demonstrations live in `technical-labs/` because they have
no place in the customer workflow; the few that do (connectivity, cross-tab,
the service worker) are in the application and say so.

## How application code reaches the browser

Never through a global. `window`, `document`, `navigator`, `localStorage`,
`sessionStorage`, `location` and `history` are banned by lint
(`apps/web/eslint.config.js`), because the application also builds for the
server, where none of them exists. The tokens in
`core/platform/platform.tokens.ts` are the way in:

| Token                                 | Gives                                                                               | On the server           |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------- |
| `WINDOW`                              | the window                                                                          | `null`                  |
| `NAVIGATOR` (Phase 5)                 | the navigator: clipboard, permissions, geolocation, locks, service worker, `onLine` | `null`                  |
| `LOCAL_STORAGE`, `SESSION_STORAGE`    | `KeyValueStorage`, best-effort, never throws                                        | no-op storage           |
| `BROADCAST_CHANNEL_FACTORY` (Phase 5) | `(name) => BroadcastChannel \| null`                                                | answers `null`          |
| `EVENT_SOURCE_FACTORY`                | `(url) => EventSource \| null`                                                      | answers `null`          |
| `OBJECT_URLS`                         | `create` / `revoke` for `blob:` URLs                                                | `create` answers `null` |

`NAVIGATOR` is one token for the object, not one per capability: each
capability is already an object with its own feature test
(`navigator.clipboard` is `undefined` on an insecure origin), and wrapping each
again would be an abstraction with one caller. Callers test for what they need.

**Phase 5 check - the tokens held.** Nine new lab pages, a service worker, a
Web Worker and cross-tab messaging were added; the server build succeeded
throughout, and no `isPlatformBrowser` guard was added anywhere. The one
browser construct not behind a token is `new Worker(new URL(...,
import.meta.url))` in the workers lab: the Angular CLI recognises only that
literal shape to bundle a worker, it runs only on a click, and the lab checks
`typeof Worker` first. (`main.ts` calls `performance.mark` directly too - it is
the browser entry point and never part of the server build.)

## Each capability

Every entry: the problem, the solution, why, the alternative, the trade-offs,
and when not to use it. Browser notes are for current evergreen browsers.

### localStorage and sessionStorage - `/technical-labs/browser-storage`

- **Problem**: a small preference (the theme) should survive a reload.
- **Solution**: `LOCAL_STORAGE` through `KeyValueStorage`; `SESSION_STORAGE`
  for what should die with the tab.
- **Why**: synchronous, simple, available before the application has fetched
  anything.
- **Alternative**: a cookie (sent with every request - wrong for UI state);
  IndexedDB (asynchronous - too late for the first paint of a theme).
- **Trade-offs**: strings only; about 5 MB per origin; synchronous, so a large
  read blocks the main thread; readable by any script on the origin.
- **When not to use it**: for tokens or secrets (ADR-0016 keeps them in
  `HttpOnly` cookies), for anything large, for anything structured.
- **Browser considerations**: throws on access in some private modes and when
  site data is blocked - `KeyValueStorage` catches and degrades to "nothing
  stored". `sessionStorage` is per tab, copied into a tab opened from it.
- **Tests**: unit (`platform.tokens.spec.ts`: refusal, round trip); browser
  integration (`e2e/labs.spec.ts`: survives a reload; `localStorage` shared
  with a new tab, `sessionStorage` not).

### The storage event - `/technical-labs/browser-storage`, `/technical-labs/cross-tab`

See [cross-tab.md](cross-tab.md). Fires in every _other_ tab of the origin on a
`localStorage` change; the theme uses it.

### IndexedDB - `/technical-labs/browser-storage`, `/technical-labs/offline`

- **Problem**: keep structured records - notes, a customer list - across
  sessions, more than `localStorage` holds, without blocking.
- **Solution**: IndexedDB through `browser-storage/indexed-db.ts`: three
  promise wrappers (`requestResult`, `transactionDone`, `openDatabase`), used
  by the notes store and the offline snapshot.
- **Why**: structured clone storage, transactions, large quotas, asynchronous.
  The wrappers are not a library: every call still names its store and
  transaction mode.
- **Alternative**: `idb` or Dexie (a query layer this does not need); the Cache
  API (keyed by request, wrong shape for records).
- **Trade-offs**: an event-based API from before promises; schema changes need
  version upgrades, and an upgrade is **blocked** while another tab holds the
  old version open - `openDatabase` closes its connection on `versionchange`
  and rejects on `blocked` rather than hang.
- **When not to use it**: for a few small values (`localStorage`); for
  anything the user would not expect to persist on a shared machine.
- **Browser considerations**: quota is per origin and granted by the browser;
  `navigator.storage.estimate()` reports it and `persisted()` says whether the
  browser may evict it - both shown in the lab. Safari deletes script-written
  storage of a site the user has not interacted with in seven days of
  browsing.
- **Tests**: browser integration - a note survives a reload; unit - the offline
  snapshot policy, with the store faked.

### URL API - `/technical-labs/browser-apis`

- **Problem**: reading and building URLs with string operations gets encoding,
  relative paths and origins wrong.
- **Solution**: `new URL(input, base)` and `URLSearchParams`.
- **Why**: the browser's own parser - it agrees with the browser on every edge
  case. `safeReturnUrl` (core/auth) uses it the same way: parse, compare
  origins, never `startsWith`.
- **Alternative**: Angular's `UrlTree` for in-app routes - which is what
  navigation code should use; the URL API is for full URLs.
- **Trade-offs**: throws on invalid input (caught, `null`).
- **When not to use it**: for router navigation.
- **Tests**: unit (`describeUrl`: relative resolution, repeated keys, decoding,
  scheme-relative cross-origin, invalid); browser integration.

### History API - `/technical-labs/browser-apis`

- **Problem**: state that belongs in history - a step, a tab - should survive
  back/forward, and some of it a reload.
- **Solution**: write through the `Router` (every navigation is a
  `pushState`), read `history.length` and `history.state` through `WINDOW`. A
  query parameter survives reloads and sharing; navigation `state` survives
  only back/forward.
- **Why**: calling `history.pushState` directly changes the URL behind the
  router's back - the address bar and the rendered route then disagree.
- **Alternative**: `Location` for back/forward (used); direct `pushState`
  (rejected, above).
- **Trade-offs**: navigation `state` is invisible in the URL - lost on reload in
  a new tab.
- **When not to use it**: for anything that must be bookmarkable - use the URL.
- **Tests**: browser integration (push, back, state restored).

### File API - `/technical-labs/browser-apis`

- **Problem**: know what a file is before uploading it.
- **Solution**: `File` is a `Blob`: `slice(0, 8).arrayBuffer()` reads the
  signature without loading the file; `text()` previews; Web Crypto
  (`crypto.subtle.digest`) hashes it. Nothing is uploaded.
- **Why**: it is how the avatar upload checks a signature (ADR-0019).
- **Alternative**: `FileReader` (event-based, older; same capability).
- **Trade-offs**: hashing needs the whole file in memory - skipped over 50 MB;
  `file.type` is a guess from the extension, never evidence.
- **When not to use it**: as a security check - the server validates again.
- **Tests**: unit (signature, preview, digest with a fake `SubtleCrypto`);
  browser integration (real SHA-256 of a real file).

### Clipboard API - `/technical-labs/browser-apis`

- **Problem**: copy an identifier with one click.
- **Solution**: `navigator.clipboard.writeText()` from the click.
- **Why**: asynchronous, promise-based, no hidden textarea.
- **Alternative**: `document.execCommand('copy')` - deprecated.
- **Trade-offs**: secure origins only (`navigator.clipboard` is missing
  otherwise); **reading** prompts or needs permission - the clipboard may hold
  anything the user copied anywhere.
- **When not to use it**: to read the clipboard without a user asking.
- **Browser considerations**: Firefox and Safari show a paste prompt instead of
  a permission.
- **Tests**: browser integration with permissions granted.

### Permissions API - `/technical-labs/browser-apis`

- **Problem**: know whether a feature will prompt, succeed or is refused,
  before asking.
- **Solution**: `navigator.permissions.query({ name })` - read-only.
- **Why**: a page cannot re-prompt after a refusal; it can explain how to
  re-enable instead of offering a button that does nothing.
- **Alternative**: just call the API and handle the refusal - always needed
  anyway.
- **Trade-offs**: uneven support per permission name; an unknown name rejects
  (reported "not supported" per permission).
- **When not to use it**: as a substitute for handling the refusal.
- **Tests**: unit (states, unknown names, no API); browser integration.

### Geolocation - `/technical-labs/browser-apis`

- **Problem**: one position, on request.
- **Solution**: `navigator.geolocation.getCurrentPosition` with a timeout,
  errors mapped by code (denied, unavailable, timeout).
- **Why**: the only browser source of position.
- **Alternative**: IP geolocation on the server (coarse, no prompt).
- **Trade-offs**: prompts; a refusal is final for the page; slow on a cold GPS.
- **When not to use it**: without a reason the user can see. Nothing here
  stores or sends the position.
- **Tests**: unit (error mapping); browser integration (granted with a fixed
  position; refused).

### Web Worker - `/technical-labs/workers`

- **Problem**: a long computation freezes the page - no input, no animation.
- **Solution**: run it in a worker (`primes.worker.ts`), exchange messages.
- **Why**: the only way to use a second thread from a page.
- **Alternative**: chunk the work with `scheduler.yield()` / `setTimeout` on
  the main thread (keeps the page responsive, same total time); do it on the
  server.
- **Trade-offs**: messages are copied (structured clone); no DOM, no Angular in
  the worker; a separate bundle (`tsconfig.worker.json`); each worker is a
  thread - created per run and terminated here.
- **When not to use it**: for work shorter than a frame, or dominated by
  copying data in and out.
- **Tests**: unit (`countPrimes`); browser integration (both runs give 1,270,607
  primes; the worker run's longest frame is shorter). Numbers:
  [performance.md](performance.md#web-worker).

### Service Worker - `/technical-labs/workers`

See [offline.md](offline.md#the-service-worker). The lab shows whether it is
registered and controlling the page, the caches it holds, and version events.

### BroadcastChannel and Web Locks

See [cross-tab.md](cross-tab.md).

### Online/offline events

See [offline.md](offline.md#connectivity-detection).
