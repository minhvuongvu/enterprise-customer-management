# Progress Log

The phase-state file. **Read this before starting any session.** Each phase updates it as part of its Definition of Done.

Its purpose: every Claude Code session starts with no memory of previous sessions. Without this file, later phases cannot know what earlier phases actually decided, skipped, or broke.

---

## Phase status

| Phase | Name | Status | Branch / tag | Completed |
|---|---|---|---|---|
| 0 | Foundation & Architecture | Not started | `phase-0` | — |
| 0.5 | Mock API & Contracts | Not started | `phase-0.5` | — |
| 1 | Routing, Layout & Design System | Not started | `phase-1` | — |
| 2 | Customer CRUD, Forms & Server State | Not started | `phase-2` | — |
| 3 | Authentication, Authorization & Security | Not started | `phase-3` | — |
| 4 | Enterprise UX, Files, Notifications & Realtime | Not started | `phase-4` | — |
| 5 | Performance, Rendering, Offline & Browser APIs | Not started | `phase-5` | — |
| 6 | Accessibility, i18n, Design System & UX Quality | Not started | `phase-6` | — |
| 7 | Observability, Testing, CI/CD & Hardening | Not started | `phase-7` | — |
| 8 | Enterprise Codebase Review | Not started | `phase-8` | — |

Status values: `Not started` · `In progress` · `Done` · `Done with deviations`

---

## Environment

| Item | Required | Actual | Checked |
|---|---|---|---|
| Node | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` | **v20.18.0 — TOO OLD, blocks Phase 0** | 2026-09-20 |
| npm | `>=8` | 11.2.0 | 2026-09-20 |
| Angular | 22.1.7 | not installed | 2026-09-20 |

Phase 0 must re-check and update this table.

---

## Phase log

Newest entry first. One entry per phase, appended at the end of that phase.

### Template — copy this

```markdown
### Phase N — <name>

**Completed:** YYYY-MM-DD · **Commit/tag:** `<tag>`

**Built**
- ...

**Architectural decisions** (link the ADR)
- ...

**Deviated from the plan**
- What the prompt asked for, what was done instead, and why.

**Deliberately not done**
- Scope that belongs to a later phase, or was dropped with a reason.

**Checks**
| Check | Result |
|---|---|
| format / lint / typecheck / test / build / e2e | ... |

**Technical debt added** (also add to the register below)
- ...

**For the next phase**
- What the next phase should know before it starts.
```

---

## Technical-debt register

Debt is only acceptable when it is written down. Remove the row when it is paid.

| # | Debt | Added in | Why accepted | Pay by | Status |
|---|---|---|---|---|---|
| — | *(empty)* | | | | |

---

## Open questions

Things that could not be decided yet and must be decided by a specific phase.

| # | Question | Must be answered by | Notes |
|---|---|---|---|
| 1 | Do Angular 22's `resource()` / `httpResource()` APIs cover the server-state needs, or is a hand-written cache required? | Phase 0 (verify) / Phase 2 (decide) | See context §5.5 |
| 2 | Does the hand-written cache survive realtime + optimistic updates, or is NgRx SignalStore needed? | Phase 4 | Revisit once, via ADR. See context §5.5 |
| 3 | Is SSR-in-dev noisy enough to hurt early phases? | Phase 1 | If yes, ADR to change 5.6 — but keep the platform tokens either way |
