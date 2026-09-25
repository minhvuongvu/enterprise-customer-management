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
| `npm run start:api`               | mock API on http://localhost:4300                |
| `npm run build`                   | production build, browser **and** server bundles |
| `npm test`                        | unit and component tests (Vitest), single run    |
| `npm run lint`                    | ESLint over TypeScript and templates             |
| `npm run typecheck`               | `ngc --noEmit` — includes template type checking |
| `npm run format` / `format:check` | Prettier                                         |
| `npm run e2e`                     | Playwright; starts the dev server itself         |
| `npm run verify`                  | everything above, in the order CI runs it        |

`npm run verify` is the one to run before calling a phase done.

Inside `apps/web`, `npm run test:watch` re-runs tests on change.

## Running the two processes

The application proxies `/api` to the mock API (`apps/web/proxy.conf.json`), so the
browser sees one origin and the session cookie is first-party - the same arrangement a
reverse proxy gives in production.

```bash
npm run start:api     # terminal 1
npm start             # terminal 2
```

`npm run e2e` starts both itself, so it needs neither.

`packages/contracts` is a compiled library (ADR-0008). Editing it requires a build
before the apps see the change:

```bash
npm run build:contracts               # once
npm run watch --workspace @ecm/contracts   # or keep it running
```

The root `typecheck`, `test`, `build` and `e2e` scripts build it first, so this only
affects the inner loop.

## Working on the mock API

It runs from source - Node 24 strips the types, so there is no build step. That costs
two rules inside `apps/mock-api/src`:

- no constructor parameter properties (`constructor(private readonly x: T)`);
- no `enum` or `namespace` in code Node loads;
- relative imports carry a literal `.ts` extension.

Contracts is the opposite: `.js` specifiers that resolve to `.ts` files, because it is
compiled. ADR-0008 explains why the two differ.

To make something fail on demand, send `x-mock-scenario`. The catalogue is at
`GET /api/_mock/scenarios` and in `docs/mock-backend.md`.

## Adding a route

1. Create the component as `<name>-page.ts` in its feature folder.
2. Add a lazy entry to the **feature's** route file — `customers/customers.routes.ts`,
   not `app.routes.ts`. The application composes features with one `loadChildren`
   each, and only a new feature touches the root tree.
3. Give it a `title`, which is a **translation key**, not a title (ADR-0009). Give it
   `data: withMetadata({ breadcrumb: '...' })` if it should appear in the trail.
4. Decide its render mode in `app.routes.server.ts`. Public and static → `Prerender`.
   Anything per-user → `Client`. If unsure, it is `Client`.
5. Put its text in `core/i18n/translations/en.json` and read it through Transloco.
6. Wrap the page in `app-page-container` and give it one `app-page-header`. That is
   the page's only `<h1>`.

## Adding a shared component

Read `apps/web/src/app/shared/ui/README.md` first — it is short, and rules 1, 3 and 7
are the ones that get broken. In particular: a component moves into `shared/ui` when a
_second_ caller needs it, not when it looks generic.

Use only semantic design tokens (`--surface-raised`, `--text-muted`). A hex literal or
a `--palette-*` reference is a component that will be wrong in the dark theme.

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

Since Phase 1 this covers **attributes** as well as text, because `aria-label`,
`placeholder` and `title` are read out to screen-reader users and are exactly the
strings that get missed — they do not look like copy. A binding satisfies the rule; a
static value does not. Attributes that are not copy (`data-testid`, ARIA state values,
SVG presentation) are named explicitly in `eslint.config.js`, and that list is the only
place they may be excused.

Neither rule is a style preference; both were verified by writing a violation and
watching lint reject it — in Phase 0 for text, and again in Phase 1 for attributes.

## Things that are deliberately not here yet

| Missing           | Arrives in |
| ----------------- | ---------- |
| A second language | Phase 6    |
| CI pipeline       | Phase 7    |

Authentication, refresh and authorization arrived in Phase 3; how they work and what
protects what is in [`security.md`](security.md).

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
