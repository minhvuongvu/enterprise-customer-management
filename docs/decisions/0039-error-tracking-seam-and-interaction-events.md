# ADR-0039 — An error-tracking seam, and interaction events as a closed vocabulary

**Status:** Accepted
**Date:** 2026-09-30
**Phase:** Phase 7

## Problem

The global error handler wrote one log line per error: no context of what the user had
done, no grouping, and an error thrown inside a change-detection loop would log sixty
lines a second. Phase 7 asks for an error-tracking abstraction and "important user
interaction events" - without choosing a vendor, and without logging personal data.

## Options considered

### Option A — adopt a vendor SDK now (Sentry)

- Pros: grouping, breadcrumbs, source maps, alerting for free.
- Cons: an account, a DSN per environment, a dependency and a network destination this
  repository has no reason to have; a learner could not run it.

### Option B — keep logging errors; add nothing

- Cons: none of the context an operator needs.

### Option C — an `ErrorTracker` abstraction with a logging implementation; a typed `Telemetry` event union

- Pros: what a tracker provides - breadcrumbs, fingerprints, repeat suppression - visible
  in a hundred lines; a vendor is one class and one provider later.
- Cons: no aggregation across users; the "tracker" is the log.

## Decision

Option C. `ErrorTracker` (`captureError`, `addBreadcrumb`) is root-provided with
`LoggingErrorTracker`: it classifies (`AppError` keeps its taxonomy), fingerprints,
suppresses repeats within 10 s, and attaches the last 20 breadcrumbs. `Telemetry.track`
takes an `InteractionEvent` - a closed union of eleven named events whose fields are
counts, kinds and roles - and writes an `info` line plus a breadcrumb. Navigations are
breadcrumbs too (from `PerformanceMonitor`).

## Reason

The seam is the lesson: call sites depend on `ErrorTracker` and `Telemetry`, never on a
vendor. The closed union makes "never log a name or an email in an event" a type error
instead of a review comment. Events are emitted where the outcome is known (after the
server said yes), so "created" means created.

## Consequences

- `Logger` and `ErrorTracker` are root-provided with working defaults, so every injector
  (component tests included) has one; `LOG_SINKS` defaults to none, so that logger is
  silent until `provideObservability()` registers sinks.
- **A subclass of `Logger` or `ErrorTracker` must carry its own `@Injectable()`**:
  otherwise Angular inherits the base class's factory, and `useClass: TestLogger`
  silently builds the real one. Found while writing this ADR's tests.
- Adding an event is an edit to the union - deliberately a review point.

## Revisit when

A real deployment wants alerting or cross-user aggregation: implement `ErrorTracker`
with the vendor's SDK (redacting in its `beforeSend`) and add a `LogSink` that ships warn
and above.
