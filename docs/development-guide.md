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
npm run build:contracts
```

That last line is not optional, and it is the one step a fresh clone gets wrong.
`packages/contracts` is a compiled library (ADR-0008), `dist/` is not tracked, and
nothing in `npm install` builds it.

**Build it again after switching branches.** `dist/` keeps whatever the previous
branch produced, and `npm start` / `npm run start:api` do not rebuild it — only
`typecheck`, `test`, `build` and `e2e` do. A stale `dist/` does not announce itself as
stale; it fails as a missing export. See Troubleshooting.

## Scripts

Run from the repository root.

| Script                            | What it does                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm start`                       | dev server on http://localhost:4200                                                             |
| `npm run start:api`               | mock API on http://localhost:4300                                                               |
| `npm run build:contracts`         | compiles `packages/contracts`; needed before the first run and after switching branches         |
| `npm run build`                   | production build, browser **and** server bundles                                                |
| `npm test`                        | unit and component tests (Vitest) plus `test:lint`, single run                                  |
| `npm run test:coverage`           | the same tests with the coverage gates CI applies — this is what `verify` runs                  |
| `npm run lint`                    | ESLint, **and** the three checks no off-the-shelf linter covers (below)                         |
| `npm run typecheck`               | `ngc --noEmit` — includes template type checking                                                |
| `npm run format` / `format:check` | Prettier                                                                                        |
| `npm run e2e`                     | Playwright; starts both servers itself                                                          |
| `npm run e2e:production`          | Playwright against the production build (service worker, preloading); run `npm run build` first |
| `npm run perf:budgets`            | asserts the bundle budgets in `perf/budgets.json`; run `npm run build` first                    |
| `npm run e2e:visual`              | visual regression in the Playwright Docker image — needs the Docker **daemon** running          |
| `npm run verify`                  | everything above, in the order CI runs it                                                       |

`npm run lint` is a chain, and it stops at the first failure: `eslint`, then
`lint:styles` (semantic tokens and logical directions only), `lint:architecture`
(dependency direction and import cycles), `lint:secrets`, then each workspace's own
lint. Each is runnable on its own — `npm run lint:architecture` — which is how to
re-check one without paying for the rest.

Two Playwright suites, two configurations: `e2e/` runs against the dev server,
`e2e-production/` against the built SSR server on port 4400. `e2e:visual` is separate
again, because pixel comparison is only meaningful on one fixed platform.

Measurement scripts (Phase 5), run with `node` from the root after `npm run build`:

| Script                             | Measures                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `node perf/bundle-report.ts`       | what the initial download holds, by package (needs `ng build --stats-json`) |
| `node perf/measure-rendering.ts`   | TTFB, FCP, LCP, hydration, bytes for each rendering specimen                |
| `node perf/measure-production.ts`  | route preloading and the performance lab's before/after pairs               |
| `node perf/generate-lab-images.ts` | regenerates the performance lab's images                                    |

**Do not run the measurement scripts beside anything else.** A number taken while the
E2E suite is using the same machine is noise, and it is noise that looks like a
regression.

`npm run verify` is the one to run before calling a phase done. Running its steps
individually — `format:check`, `lint`, `typecheck`, `test:coverage`, `build`,
`perf:budgets`, `e2e`, `e2e:production` — is worth it the first time on a new machine,
because a failure then names its own step instead of appearing at the end of a
twenty-minute chain.

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

Sign in as `admin`, `manager` or `viewer` with **any** password. The mock backend does
not verify one — which is the reason there is no credential anywhere in this
repository — and the three users differ in what they are allowed to do, which is the
point of having three (`docs/security.md`).

`packages/contracts` is a compiled library (ADR-0008). Editing it requires a build
before the apps see the change:

```bash
npm run build:contracts               # once
npm run watch --workspace @ecm/contracts   # or keep it running
```

The root `typecheck`, `test`, `build` and `e2e` scripts build it first. `npm start`
and `npm run start:api` do **not** — which is why Setup builds it once by hand, and
why switching branches needs it again.

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
translation layer - in English and Vietnamese, with the same keys in both (a unit
test compares the files). Numbers, dates and money go through the `Intl` pipes in
`core/i18n/locale-pipes.ts`, never through string building; see [`i18n.md`](i18n.md).

Since Phase 1 this covers **attributes** as well as text, because `aria-label`,
`placeholder` and `title` are read out to screen-reader users and are exactly the
strings that get missed — they do not look like copy. A binding satisfies the rule; a
static value does not. Attributes that are not copy (`data-testid`, ARIA state values,
SVG presentation) are named explicitly in `eslint.config.js`, and that list is the only
place they may be excused.

Neither rule is a style preference; both were verified by writing a violation and
watching lint reject it — in Phase 0 for text, and again in Phase 1 for attributes.

## Things that are deliberately not here yet

| Missing     | Arrives in |
| ----------- | ---------- |
| CI pipeline | Phase 7    |

**Styles are linted too** (`npm run lint:styles`, Phase 6): semantic tokens only,
logical directions only, focus outline intact - see [`design-system.md`](design-system.md).

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

**The production server answers 400 "Header host ... is not allowed".** The SSR
server only accepts the hosts in `security.allowedHosts`. Start it with
`NG_ALLOWED_HOSTS=localhost node apps/web/dist/web/server/server.mjs`, as the
measurement scripts do.

**A stale application after a production build.** The service worker serves the
cached shell until the new version is installed and the page reloaded. In
DevTools → Application → Service workers, "Update on reload" or "Unregister".

**Something fails with `does not provide an export named '…'`.** `packages/contracts`
is compiled and `dist/` is not tracked, so it holds whatever the last branch you were
on produced. Run `npm run build:contracts`. This is the usual first failure after
`git checkout` of another phase, and it is loudest in `npm run start:api`, which does
not build contracts itself.

**The dev server still fails on a contracts export you have just built.** The Angular
dev server pre-bundles dependencies and caches them. After the _exports_ of
`@ecm/contracts` change, delete `apps/web/.angular/cache` before `npm start` or the
E2E suite.

**`npm run e2e:visual` fails and Docker is installed.** The CLI is not enough; the
daemon has to be running. `docker info` answers in one line whether it is. The suite
only runs in the Playwright image on purpose — a screenshot taken on another platform
compares against nothing useful.

**`npm run e2e` cannot reach the server.** Playwright starts both servers itself and
reuses ones that are already running. A stale process on port 4200 or 4300 serving
something else produces failures that look like application bugs. On Windows, find and
stop it with:

```bash
netstat -ano | grep LISTENING | grep ':4200 '   # the PID is the last column
taskkill //PID <pid> //F                        # two slashes: Git Bash eats one
```

`fuser -k 4200/tcp` is the equivalent elsewhere. Stop the dev servers before a full
E2E run, so Playwright starts ones that are serving the code you are testing.
