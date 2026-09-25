# ADR-0030 — The leader-election lab uses a localStorage lease, on purpose

**Status:** Accepted
**Date:** 2026-09-25
**Phase:** Phase 5

## Problem

Phase 5 asks for an isolated experiment in which exactly one tab runs a
periodic background job and the others receive its result - documenting the
algorithm, failure modes, race conditions, limitations and browser-lifecycle
issues. It is explicitly a learning experiment, not a production lock.

## Options considered

### A — Web Locks (`navigator.locks.request` held for the tab's lifetime)

- Pros: correct. The browser grants the lock to one tab and hands it on when
  that tab dies. No timers, no races.
- Cons: there is almost nothing to observe - the algorithm is inside the
  browser, and the failure modes the phase asks to document do not occur.

### B — A lease in localStorage with heartbeats, settle-and-reread (chosen)

- Pros: every moving part is in 150 lines, and each documented failure can be
  provoked from the page ("Freeze heartbeat").
- Cons: not a lock. Two leaders can briefly coexist.

## Decision

`technical-labs/leader-election/lease-election.ts`: a lease record
`{ holder, expiresAt }` in localStorage; heartbeat 1 s; lease 3 s; a claimant
writes, waits 150 ms and re-reads to see whether its write survived; a leader
renews, and steps down when the record names someone else; `pagehide` resigns
and announces it, so a follower takes over within a heartbeat. The job (a
health check) re-checks the lease immediately before running; results are
posted on a `BroadcastChannel`. The application itself uses Web Locks where it
needs exclusion (ADR-0027).

## Reason

The phase's purpose is understanding. A lease shows _why_ distributed mutual
exclusion is hard - no compare-and-set, clocks, paused processes - and the
comparison with Web Locks in docs/cross-tab.md is the lesson.

## Consequences

- The lab's job must be idempotent; it is (a read).
- Unit tests drive the algorithm with fake timers and a shared fake storage,
  including a hand-made interleaving of the claim race; E2E runs it across
  three real pages.

## Revisit when

- Something in the application needs a single-tab job: use Web Locks, not this.
