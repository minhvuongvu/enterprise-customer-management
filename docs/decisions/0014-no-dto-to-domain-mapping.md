# ADR-0014 — The contract type is the domain type; there is no mapping layer

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 2

## Problem

Open question 6, carried since Phase 0.5: _where does DTO-to-domain mapping
live once the customer feature exists?_

`@ecm/contracts` produces validated, branded types - `Customer`, `Instant`,
`DateOnly`, `CustomerId`. The received wisdom in enterprise frontends is that
transport types should not reach the UI, and that a mapper should translate
them into a domain model the application owns.

Phase 2 is the first phase with a feature to test that against.

## Options considered

### Option A — A mapper and a parallel model

`CustomerDto` → `mapCustomer()` → `Customer`, one of each per resource.

- Pros: the feature is insulated from a backend that changes shape; the domain
  model can carry behaviour.
- Cons: for this API, sixteen fields copied one-to-one, plus a second type to
  keep in step, plus a second place to look when a field is missing. It
  reintroduces exactly the duplication `@ecm/contracts` was created to remove,
  and the compiler cannot tell that the two are meant to agree.

### Option B — No mapping; the contract type is the type

- Pros: one definition, checked at runtime at the boundary and by the compiler
  everywhere else. A field added to the API appears in the feature by
  typechecking, not by remembering to extend a mapper.
- Cons: a hostile change to the API reaches every component that reads that
  field. Behaviour has nowhere natural to live if the model ever needs some.

### Option C — Map only where the shapes genuinely differ

- Pros: pays only where there is something to pay for.
- Cons: needs a rule for "genuinely differ", or it decays into Option A by
  habit.

## Decision

Option B, with Option C as the stated escape hatch.

There is **no** DTO-to-domain mapping layer. `Customer` from `@ecm/contracts`
is the type the store, the pages and the form use. What the feature adds is not
a model but two thin, honest things:

- **presentation mapping** - `customer-vocabulary.ts` turns a status into a
  translation key and a badge tone, and `formatDateOnly` renders a calendar
  date. These are rendering decisions, not a second model.
- **form mapping** - `toFormValue` / `toCreateRequest` / `toUpdateRequest`
  convert between a record and the strings a form holds. That conversion is
  real work (null versus empty string, tags versus a comma-separated field),
  and it is a _form_ concern, so it lives with the form.

A mapper becomes the right answer when one of these is true, and this API has
none of them today:

1. one concept arrives in different shapes from different endpoints;
2. the wire shape is actively hostile - flattened, stringly typed, or carrying
   fields whose meaning depends on another field;
3. the domain has behaviour that belongs on the object rather than beside it.

## Reason

This repository's rule is that an abstraction needs a stated second caller
(CLAUDE.md rule 8). A mapper's second caller here would be a hypothetical
future backend, and building for it costs a real, permanent duplication to
avoid a speculative one.

The insulation argument is also weaker than it looks in a repository where the
contract is shared source: the mock API and the application cannot drift
without the contract package changing, and when it changes the compiler points
at every affected line. A mapper would convert that compile error into a silent
field that is quietly always `undefined`.

## Consequences

- One definition of a customer, in one package, validated once at the boundary.
- Branded types reach the UI, which is a benefit: a template cannot accidentally
  pass an `Instant` where a `DateOnly` belongs.
- If the API ever does become hostile, the mapping goes in `customers/data/`,
  next to the client that receives it, and nowhere else.
- This closes open question 6.

## Revisit when

Any of the three conditions above becomes true - most plausibly the first, if a
later phase adds an endpoint that returns a customer summary with a different
field set from the full record.
