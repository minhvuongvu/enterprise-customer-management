# ADR-0038 — One log-redaction policy, in the contracts, applied inside each logger

**Status:** Accepted
**Date:** 2026-09-30
**Phase:** Phase 7

## Problem

Both the browser and the mock API now write structured logs about the same resources.
Phase 0's redaction lived in the web logger only, knew six credential words and nothing
about personal data, and matched keys only - so `Error: duplicate key an@example.test`,
a search string, or a customer record passed through untouched. The mock API had no
redaction at all. Phase 7 must prove that secrets, tokens and personal data never reach
a log, on both sides.

## Options considered

### Option A — each app keeps its own list

- Pros: no cross-package change.
- Cons: two lists of "what is sensitive" drift; the one that is wrong is the one nobody
  reads. A personal field added to `customerSchema` has to be remembered in two places.

### Option B — redact at each call site

- Pros: explicit.
- Cons: the call site is exactly where someone forgets. One missed call leaks.

### Option C — one policy in `@ecm/contracts`, applied inside each logger before any sink

- Pros: one list, next to the schemas that define the fields; both loggers apply it; no
  sink, present or future, can see a raw value.
- Cons: the contracts package gains something that is not a schema.

## Decision

Option C. `packages/contracts/src/log-redaction.ts` exports `redactLogFields`,
`redactLogValue` and `redactText`: redaction by key (credentials by fragment, personal
fields by exact name) and by value (email addresses, JWTs and `Bearer` tokens anywhere in
any string; `Error` reduced to name and masked message). `StructuredLogger` (web) and
`MockApiLogger` apply it before writing to any sink or buffer.

## Reason

What is personal in this domain is decided by the contract - `customerSchema`,
`addressSchema`. Keeping the list beside them makes "added a personal field" and "taught
the logs to hide it" one review. Applying it inside the logger rather than at call sites
makes the guarantee structural.

## Consequences

- Tested at three levels: the policy (contracts), each side's sink (web, mock API), and
  a real sign-in end to end (password and cookie values absent from both logs).
- Key names that contain a fragment are hidden even when harmless (`sessionId`,
  `tokenCount`); accepted - a false mask costs a field, a missed one leaks.
- Redaction does not recognise a secret with no recognisable key or shape. The rule
  remains "log identifiers, not records"; this is the net under it.
- A vendor error tracker is a sink: its `beforeSend` must run `redactLogValue`.

## Revisit when

A real backend with its own logging stack appears - it would adopt the same list, or the
list would move to wherever that stack's configuration lives.
