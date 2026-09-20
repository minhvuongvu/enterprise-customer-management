# Development guide

## Prerequisites

| Tool | Requirement                                                              |
| ---- | ------------------------------------------------------------------------ |
| Node | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` — pinned to `24.21.0` in `.nvmrc` |
| npm  | `>=8` (11.x in use)                                                      |

`engine-strict=true` is set in the repository `.npmrc`, so `npm install` refuses to
run on an unsupported Node instead of failing later in a confusing way.

The same `.npmrc` sets `legacy-peer-deps=false`. Do not remove it. Angular 22 pins
TypeScript to `>=6.0 <6.1` and Vitest to `^4`, and peer-dependency enforcement is what
stops an incompatible version from being installed silently.

## Setup

```bash
nvm use            # or otherwise select the version in .nvmrc
npm install        # installs every workspace from the root
npx playwright install chromium
```

## Scripts

Run from the repository root.

| Script                            | What it does                                     |
| --------------------------------- | ------------------------------------------------ |
| `npm start`                       | dev server on http://localhost:4200              |
| `npm run build`                   | production build, browser **and** server bundles |
| `npm test`                        | unit and component tests (Vitest), single run    |
| `npm run lint`                    | ESLint over TypeScript and templates             |
| `npm run typecheck`               | `ngc --noEmit` — includes template type checking |
| `npm run format` / `format:check` | Prettier                                         |
| `npm run e2e`                     | Playwright; starts the dev server itself         |
| `npm run verify`                  | everything above, in the order CI runs it        |

`npm run verify` is the one to run before calling a phase done.

Inside `apps/web`, `npm run test:watch` re-runs tests on change.

## Adding a route

1. Create the component as `<name>-page.ts` in its feature folder.
2. Add a lazy entry to `app.routes.ts`. Every route is lazily loaded; there is no
   reason for a new one to be the exception.
3. Decide its render mode in `app.routes.server.ts`. Public and static → `Prerender`.
   Anything per-user → `Client`. If unsure, it is `Client`.
4. Put its text in `core/i18n/translations/en.json` and read it through Transloco.

## The rules lint enforces

Two mistakes are cheap to make and expensive to find later, so they fail the build:

**No browser globals.** `window`, `document`, `localStorage`, `sessionStorage`,
`navigator`, `location`, `history`. Inject the tokens from
`core/platform/platform.tokens.ts` instead. The application is server-rendered; a
direct global breaks the server build, sometimes only in production.

**No hardcoded user-facing strings.** Everything a user reads goes through the
translation layer, today, while only English exists. The expensive part of i18n is
never the second language — it is finding six phases of strings that were typed
inline.

Neither rule is a style preference; both were verified in Phase 0 by writing a
violation and watching lint reject it.

## Things that are deliberately not here yet

| Missing                                      | Arrives in |
| -------------------------------------------- | ---------- |
| Mock API, API contracts                      | Phase 0.5  |
| Application shell, navigation, design system | Phase 1    |
| Customer feature, forms, server state        | Phase 2    |
| Real authentication and authorization        | Phase 3    |
| CI pipeline                                  | Phase 7    |

If you need one of these now, that is a signal the phase order is wrong — raise it
rather than building it early.

## Troubleshooting

**`npm install` refuses to run.** Node is not in the supported range. Check `node -v`
against `.nvmrc`. Do not work around it by lowering the Angular version.

**Lint complains about `window` in code that only runs in the browser.** Correct. The
file is still compiled into the server bundle. Inject `WINDOW`; it is `null` on the
server, and the rest of the code stays identical.

**A template type error only appears during `npm run build`.** It should have appeared
in `npm run typecheck` — that script runs `ngc`, not `tsc`, precisely so templates are
checked. If it did not, the tsconfig project list has drifted.

**`npm run e2e` cannot reach the server.** Playwright starts the dev server itself and
reuses one that is already running. A stale process on port 4200 that is serving
something else will produce confusing failures.
