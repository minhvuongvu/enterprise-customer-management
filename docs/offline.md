# Offline and connectivity

**The application is not offline-capable.** It starts without a network,
says clearly when it is offline, and keeps one read-only list available in a
lab. It does not queue writes, synchronise in the background, or let a page
the user never opened work offline. Decisions:
[ADR-0028](decisions/0028-service-worker-caches-the-shell-only.md),
[ADR-0029](decisions/0029-offline-scope.md).

## What works offline, exactly

| Situation, offline                                         | What happens                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Opening the application (production build, visited before) | Starts: the service worker serves the cached shell and last runtime configuration                       |
| Any page, after start                                      | Renders, then its data requests fail through the normal error path - an error state, not a blank page   |
| The shell                                                  | Shows a banner: nothing can be saved, what is shown may be out of date                                  |
| Saving anything                                            | Fails through the normal error path. Nothing is queued                                                  |
| The offline lab's customer list                            | Shown from IndexedDB, labelled as a saved copy with the time it was fetched, read-only                  |
| Realtime                                                   | The status shows "Reconnecting…"; the stream reconnects and replays what it missed on return (ADR-0020) |
| Coming back online                                         | Banner goes; a toast says so; the offline lab refreshes by itself                                       |
| Development server (`npm start`)                           | No service worker: reloading while offline fails, by design                                             |

## Connectivity detection

`core/connectivity/ConnectivityService`: `online` (a signal) and
`reconnected$`, from `navigator.onLine` and the `online` / `offline` events -
through the `NAVIGATOR` and `WINDOW` tokens, so the server build reports
"online" and never touches a global.

**What `online` means**: a network interface is up. `false` is reliable;
`true` is not proof the server is reachable (captive portals, a dead router,
an outage). So the banner only speaks when the browser is certain, and the
offline lab falls back to its copy whenever the _fetch_ fails, whatever
`online` says.

- **Problem**: a user whose network dropped sees the application silently fail.
- **Solution**: listen to the browser's connectivity events; say so everywhere.
- **Why**: the only signal available without polling, and certain in the
  direction that matters.
- **Alternative**: poll a health endpoint - detects a dead server too, at the
  cost of requests from every tab forever (see the leader-election lab for
  making one tab do it).
- **Trade-offs**: false "online" is possible; the banner must not promise more
  than "you are offline".
- **When not to use it**: to decide whether to send a request. Send it, and
  handle the failure.

## Offline UI

`layout/offline-banner.ts`, in the shell: a `role="status"` banner while
offline, and a success toast on return. Deliberately narrow in what it
promises.

## The service worker

Angular's `@angular/service-worker`, production builds only, registered once
the application is stable. `apps/web/ngsw-config.json`:

| Group            | What                                 | Strategy                                                 |
| ---------------- | ------------------------------------ | -------------------------------------------------------- |
| `app-shell`      | `index.csr.html`, JS and CSS bundles | prefetched at install, updated atomically                |
| `lab-assets`     | `/labs/**` images                    | cached on first use                                      |
| `runtime-config` | `/config.json`                       | network first, 3 s timeout, then cache                   |
| navigations      | every page request                   | **network first** (`freshness`), cached shell on failure |
| `/api/**`        | -                                    | **never cached**                                         |

Network-first navigation matters here: the prerendered `/login` and the
server-rendered specimens are still served from the server while online; the
cached client shell is the fallback, not the default.

**What is not cached, and why**: API responses. A service worker cache outlives
the session and belongs to whoever uses the browser next; a cached customer
list is a copy of personal data no code decided to keep and no sign-out
deletes. The production test suite asserts it: after signing in and loading
customers, no `/api` URL is in any cache (`e2e-production/production.spec.ts`).

- **Problem**: nothing can show offline if the application cannot start.
- **Solution**: cache the shell with a maintained service worker.
- **Why**: hashed assets and atomic updates are the part hand-written service
  workers get wrong - and a broken one serves a stale app until unregistered.
- **Alternative**: a hand-written worker with Workbox or none; HTTP caching
  alone (does not help a navigation with no network).
- **Trade-offs**: 6.1 kB in the initial bundle; update semantics to understand
  (a new version is used on the _next_ load); `ngsw-worker.js` and `ngsw.json`
  must be served uncached.
- **When not to use it**: an application that must never show a stale shell
  (kiosk, regulated flows), or where users rarely return to the same device.

## Cached read-only data: the offline lab

`/technical-labs/offline`, `technical-labs/offline/offline-directory.ts`:

1. **Online**: fetch the first 25 customers (the lab's own API client, the same
   interceptors and contract validation as everything else), show them, and
   write a copy to IndexedDB (`ecm-lab-offline`) - **read-through**.
2. **Offline, or the fetch failed**: show the copy, labelled "Saved copy from
   …, read-only".
3. **Back online**: fetch again without being asked.

### What is on the disk

Only `id`, `customerCode`, `fullName` and `status` - never the date of birth,
phone or address - with the owner's user id and the fetch time. The copy is:

- deleted when the session ends in a tab that has opened the lab - sign-out,
  expiry, or sign-out in another tab - wherever that tab is by then (the
  cleanup is provided on the lab's route, whose injector lives until the tab
  closes: `provideOfflineSnapshots`);
- deleted on sight if it belongs to a different user, never shown;
- deletable from the page.

**Limitation**: if every tab that opened the lab is closed before the session
ends, the copy stays on disk until the lab is opened again in that browser
(deleted then if the user differs) or the user deletes it.

### Write queueing: not implemented

There is no write queue, so there is no consistency model to describe: every
save either reached the server or visibly failed. A future offline workflow
must decide, before anything else, what happens when a queued write meets a
newer version on the server (ADR-0015 keeps both edits on a 409 today; offline
would make that the normal case, not the exception).

- **Problem**: a user losing the network loses sight of the data they were
  reading.
- **Solution**: a read-through copy of one list, user-scoped, minimal.
- **Why**: shows detection, offline UI, cached data and reconnect on real data,
  without weakening any guarantee of the customer workflow.
- **Alternative**: service-worker `dataGroups` (rejected, above); an
  offline-first local database with sync (a phase of its own).
- **Trade-offs**: data on disk; a copy that can be stale (labelled as such).
- **When not to use it**: for data the user must not keep on a shared machine,
  or where a stale read causes harm (prices, stock, permissions).

## Tests

| Kind                | What                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Unit                | `ConnectivityService` events; `OfflineDirectory` policy (network, fallback, owner check, reconnect, sign-out) |
| Browser integration | `e2e/labs.spec.ts`: offline banner, fallback to the saved copy, refresh on reconnect, deleting the copy       |
| Production build    | `e2e-production/production.spec.ts`: the app starts offline once installed; no API response is cached         |
