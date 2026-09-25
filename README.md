# Enterprise Customer Management

An enterprise-oriented Angular learning repository: a deliberately small business
domain — customer management — with the architecture, engineering practices and
failure modes of a large frontend.

It is judged on whether the architecture is understandable, realistic, maintainable
and educational, not only on whether the application works.

## Status

**Phase 5 complete** — foundation and seams, the API contract and a real mock
backend, the application shell, the customer feature, authentication and
authorization, enterprise UX (live updates, notifications, files, audit), and now
performance, rendering and the browser: measured rendering modes, a bundle cut
from 808 to 525 kB, route preloading, tabs that coordinate (sign-out, customer
changes, session refresh), a service worker that starts the app offline, and
nine technical labs - storage, browser APIs, workers, offline, cross-tab, leader
election, performance and rendering - each with its numbers.
See `docs/PROGRESS.md` for what exists and what comes next.

## Quick start

```bash
nvm use                          # Node 24.21.0, see .nvmrc
npm install
npx playwright install chromium

npm run start:api                # mock API on http://localhost:4300
npm start                        # the app on http://localhost:4200
npm run verify                   # format, lint, typecheck, test, build, e2e, e2e:production
```

Node `^22.22.3 || ^24.15.0 || >=26.0.0` is required. `npm install` will refuse to run
otherwise, which is deliberate.

## Layout

```text
apps/web/            Angular 22 application - standalone, signals, zoneless, SSR-scaffolded
apps/mock-api/       Express mock backend - real cookies, CSRF, CORS, SSE
packages/contracts/  Zod schemas + inferred types, shared by app and API
e2e/                 Playwright specs, including accessibility scans
e2e-production/      Playwright specs against the production build (service worker, preloading)
perf/                measurement scripts and their recorded results
docs/                architecture, guides, ADRs, progress log
prompts/             the phase prompts this repository is built from
```

## Where to read next

| Document                        | What it answers                                                       |
| ------------------------------- | --------------------------------------------------------------------- |
| `CLAUDE.md`                     | the working rules, and the rules that must not be broken              |
| `ANGULAR_PROJECT_CONTEXT.md`    | product scope and engineering intent — the authority                  |
| `ANGULAR_PROJECT_CONTEXT.md` §5 | the locked technical decisions, and why they are locked               |
| `docs/architecture.md`          | what the code looks like and which way dependencies point             |
| `docs/development-guide.md`     | how to run, build, test and add to it                                 |
| `docs/testing-strategy.md`      | what is tested where, and the gaps that are known                     |
| `docs/api-contract.md`          | the API shape, error envelope, permissions, concurrency               |
| `docs/mock-backend.md`          | the mock server, fault injection, and who owns which security control |
| `docs/security.md`              | authentication, authorization, and which protection belongs to whom   |
| `docs/realtime.md`              | live updates: SSE, reconnect, duplicates, what an event does to state |
| `docs/file-handling.md`         | avatar upload, CSV import and export, validation on both sides        |
| `docs/state-management.md`      | who owns which state, and why the hand-written cache held up          |
| `docs/performance.md`           | every optimization with its before/after numbers                      |
| `docs/rendering.md`             | CSR, SSR, prerender, hydration - what each costs here, measured       |
| `docs/offline.md`               | exactly what works offline, and what does not                         |
| `docs/browser-capabilities.md`  | the browser APIs used, and how they are reached safely                |
| `docs/cross-tab.md`             | tabs coordinating, and the leader-election experiment                 |
| `docs/decisions/`               | ADRs — the trade-offs behind each significant choice                  |
| `docs/PROGRESS.md`              | phase log, deviations, technical-debt register                        |

## The two rules that lint enforces

No browser globals in application code, and no hardcoded user-facing strings. Both are
cheap to break and expensive to find later; `docs/development-guide.md` explains why
each one is a build failure rather than a code-review comment.
