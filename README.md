# Enterprise Customer Management

An enterprise-oriented Angular learning repository: a deliberately small business
domain — customer management — with the architecture, engineering practices and
failure modes of a large frontend.

It is judged on whether the architecture is understandable, realistic, maintainable
and educational, not only on whether the application works.

## Status

**Phase 0 complete** — foundation, architecture and cross-cutting seams. There is no
customer feature yet; see `docs/PROGRESS.md` for what exists and what comes next.

## Quick start

```bash
nvm use                          # Node 24.21.0, see .nvmrc
npm install
npx playwright install chromium

npm start                        # http://localhost:4200
npm run verify                   # format, lint, typecheck, test, build, e2e
```

Node `^22.22.3 || ^24.15.0 || >=26.0.0` is required. `npm install` will refuse to run
otherwise, which is deliberate.

## Layout

```text
apps/web/            Angular 22 application - standalone, signals, zoneless, SSR-scaffolded
apps/mock-api/       Express mock backend                          (Phase 0.5)
packages/contracts/  Zod schemas shared by app and API             (Phase 0.5)
e2e/                 Playwright specs, including accessibility scans
docs/                architecture, guides, ADRs, progress log
prompts/             the phase prompts this repository is built from
```

## Where to read next

| Document                        | What it answers                                           |
| ------------------------------- | --------------------------------------------------------- |
| `CLAUDE.md`                     | the working rules, and the rules that must not be broken  |
| `ANGULAR_PROJECT_CONTEXT.md`    | product scope and engineering intent — the authority      |
| `ANGULAR_PROJECT_CONTEXT.md` §5 | the locked technical decisions, and why they are locked   |
| `docs/architecture.md`          | what the code looks like and which way dependencies point |
| `docs/development-guide.md`     | how to run, build, test and add to it                     |
| `docs/testing-strategy.md`      | what is tested where, and the gaps that are known         |
| `docs/decisions/`               | ADRs — the trade-offs behind each significant choice      |
| `docs/PROGRESS.md`              | phase log, deviations, technical-debt register            |

## The two rules that lint enforces

No browser globals in application code, and no hardcoded user-facing strings. Both are
cheap to break and expensive to find later; `docs/development-guide.md` explains why
each one is a build failure rather than a code-review comment.
