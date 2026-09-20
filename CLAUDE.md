# CLAUDE.md

Operating rules for this repository. Read this fully before touching anything.

## What this repository is

An **enterprise-oriented Angular learning repository**: a small Customer Management domain, deliberately deep technical architecture. It is judged on whether the architecture is understandable, realistic, maintainable and educational — not only on whether the app works.

## Sources of truth — read in this order

| File | What it decides |
|---|---|
| `ANGULAR_PROJECT_CONTEXT.md` | **Product scope and engineering intent. The authority.** |
| `ANGULAR_PROJECT_CONTEXT.md` §5 | **Locked technical decisions.** Never change these in an implementation phase |
| `docs/PROGRESS.md` | What is actually done, what deviated, what debt exists. **Read this first every session** |
| `docs/decisions/` | ADRs. A locked decision changes only by a superseding ADR |
| `prompts/Phase *.md` | The prompt for the phase currently being implemented |

If this file and `ANGULAR_PROJECT_CONTEXT.md` disagree, `ANGULAR_PROJECT_CONTEXT.md` wins — and say so rather than silently picking one.

## Runtime prerequisite

Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26.0.0`.

The pinned version is in `.nvmrc` — currently **24.21.0**, installed via nvm for Windows v2. Check `node -v` before any install; do not downgrade Angular to fit an older Node.

The repository `.npmrc` sets `legacy-peer-deps=false` and `engine-strict=true`. Do not disable either: the global `~/.npmrc` on this machine turns peer-dependency checking off, and this project depends on it being on.

## Repository layout

```text
apps/web/          Angular application
apps/mock-api/     Express mock backend — a real server, not an interceptor
packages/contracts/ Zod schemas + inferred DTO types + shared fixtures
docs/              architecture docs, decisions/, PROGRESS.md
prompts/           phase prompts
```

Dependency direction: `apps/web → packages/contracts ← apps/mock-api`.
`packages/contracts` never imports from `apps/*`.

## Non-negotiable rules

These are the ones that get violated silently and cost a repository-wide refactor later.

1. **No hardcoded user-facing strings.** Every string a user can read goes through the translation layer, from the first line of code — even while only `en` exists.
2. **No direct browser globals.** No `window`, `document`, `localStorage`, `navigator` in application code. Use the platform injection tokens. The app is SSR-scaffolded; a direct global breaks the server build.
3. **No `HttpClient` in components.** Presentation → feature state → API client → HTTP. No shortcuts.
4. **No cross-feature deep imports.** A feature imports another feature only through its public entry point.
5. **No `utils/`, `helpers/`, `common/` dumping grounds.** Code lives next to the feature that owns it.
6. **No raw backend errors shown to users.** Everything maps through the error taxonomy.
7. **No secrets in the repository.** Not in code, not in fixtures, not in `.env` files that are committed.
8. **No new abstraction without a stated reason.** If you cannot name the second caller, do not abstract yet.
9. **All instants are UTC ISO-8601** in storage and transport, formatted only at render time. `dateOfBirth` is date-only and must never be timezone-shifted.
10. **Frontend checks are UX, not security.** Never describe a frontend-only control as a security boundary. The mock API enforces authorization independently.

## Per-phase workflow

1. Read `docs/PROGRESS.md`, then the phase prompt.
2. Inspect what actually exists. Do not assume the previous phase finished as planned.
3. Produce a short plan. State trade-offs and anything that conflicts with an existing decision.
4. Implement **only** that phase's scope. Do not refactor unrelated code. Do not implement later phases.
5. Run the checks (below) and fix everything you introduced.
6. Update `docs/`, write an ADR for any significant decision, update `docs/PROGRESS.md`.
7. Commit on the phase branch.

## Definition of Done — every phase

A phase is done only when all of these hold:

- [ ] `npm run format` — clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` — clean under `strict` + `strictTemplates`
- [ ] `npm run test` — passing, meaningful assertions, no `.skip` left behind
- [ ] `npm run build` — succeeds, including the server build
- [ ] `npm run e2e` — passing (from the phase where E2E infrastructure exists)
- [ ] Non-negotiable rules 1–10 hold for all new code
- [ ] No circular dependencies introduced
- [ ] Docs updated; ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: what was built, what deviated, what debt was added
- [ ] Work committed on the phase branch

Report honestly. A failing check is reported as failing, with output. Never mark a phase done with a known-broken check.

## Git

- One branch per phase: `phase-0`, `phase-0.5`, `phase-1`, …
- Tag the phase on completion as `phase-N-complete`. The tag must not share a
  name with the branch: git then reports `refname is ambiguous` and `git
  checkout phase-1` stops meaning one thing.
- Commit only when a phase or a coherent step is finished — not mid-edit.

## Style

Prefer explicit over clever. This repository is read by someone learning enterprise Angular; a slightly more verbose implementation that makes an architectural concept visible is the correct trade-off. Match the surrounding code's conventions.
