# ADR-0035 — Validation reasons as codes: `details.fieldIssues`

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

Debt row 12. A 422 named the field (`fieldErrors: { fullName: [...] }`) but its reason
was a developer sentence from Zod - English, internal, and forbidden on screen (§4.7).
So a server rejection could only ever say "The server rejected this value", in either
language, even when the reason was as simple as "too long".

## Options considered

### A — Translate Zod's messages on the client

- Cons: parsing prose. A Zod upgrade rewords a message and the client silently falls
  back; the messages also carry schema internals.

### B — Replace `fieldErrors` with codes

- Cons: a breaking contract change for every consumer, and the prose is still useful in
  logs.

### C — Add `fieldIssues`, same keys, a closed vocabulary of codes (chosen)

## Decision

`details.fieldIssues: Record<path, { code, limit? }[]>` alongside `fieldErrors`. Codes
name the _rule_, not the Zod construct: `REQUIRED`, `TOO_LONG` / `TOO_MANY` (with
`limit`), `INVALID_FORMAT`, `INVALID_VALUE`, `UNKNOWN_FIELD`. The mock API derives them
in `parseOrThrow`: "required" is decided from the input value (missing and empty mean
the same to a user), and an exact length (`country`, two letters) is a format, not a
bound.

The client maps each code to the sentence its **own validator** for that field would
show - `TOO_LONG` on `fullName` becomes "Use 150 characters or fewer.", `INVALID_FORMAT`
on `email` becomes the email sentence - so a user sees the same words whichever side
caught the problem. A missing or unknown code still falls back to the generic message.

## Consequences

- Additive and optional: an older server, or a fault injected without codes, still
  works. The contract tests and the mock API tests cover both shapes.
- The vocabulary is deliberately coarse. A rule that needs its own sentence gets its
  own code, in the contract, reviewed like any contract change.

## Revisit when

- Validation moves to a real backend with its own error model; `fieldIssues` is then
  the shape to map _to_.
