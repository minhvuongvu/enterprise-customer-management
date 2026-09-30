# Observability

What the application and the mock API record about themselves, how one user action is
followed from the browser into the server's log, what is never recorded, and where a
real deployment would plug in a collector or an error-tracking service.

Decisions: [ADR-0038](decisions/0038-one-redaction-policy-in-the-contracts.md) (redaction),
[ADR-0039](decisions/0039-error-tracking-seam-and-interaction-events.md) (error tracking,
interaction events). Performance budgets: [performance.md](performance.md#budgets).

---

## 1. The architecture

```text
 call site ─▶ Logger ─▶ StructuredLogger ──────────────┬─▶ ConsoleLogSink    (always)
             (abstract)  1. level threshold (config)    └─▶ MemoryLogSink     (dev builds only)
                         2. redaction (@ecm/contracts)       └─ read by the observability lab
                         3. common fields

 Angular ErrorHandler ─▶ ErrorTracker ─▶ Logger         breadcrumbs, grouping, repeat suppression
 Telemetry.track()    ─▶ Logger + ErrorTracker.breadcrumb
 HTTP interceptors    ─▶ Logger + PerformanceMonitor.recordApiCall
 PerformanceMonitor   ─▶ Logger (debug within budget, warn over it)

 mock API: request ─▶ correlation-id ─▶ request-log ─▶ … ─▶ MockApiLogger ─▶ stdout (JSON lines)
                                                                        └─▶ buffer ─▶ GET /api/_mock/logs
```

| Piece                  | File                                            | Responsibility                                                   |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `Logger`               | `core/logging/logger.ts`                        | The only logging API call sites know                             |
| `StructuredLogger`     | same                                            | Threshold → redaction → common fields → every sink               |
| `LOG_SINKS`            | same                                            | Multi-provider: adding a sink is a provider, not an edit         |
| `redactLogFields`      | `packages/contracts/src/log-redaction.ts`       | The one list of what may never be logged, both sides (ADR-0038)  |
| `endpointTemplate`     | same                                            | URL → route template (`/api/customers/:id`), used by both logs   |
| `ErrorTracker`         | `core/observability/error-tracker.ts`           | Report unhandled errors with context; the vendor seam (ADR-0039) |
| `Telemetry`            | `core/observability/telemetry.ts`               | Named, typed user-interaction events                             |
| `PerformanceMonitor`   | `core/observability/performance-monitor.ts`     | Initial load, route navigation, API latency, long tasks          |
| `PERFORMANCE_BUDGETS`  | `core/observability/performance-budgets.ts`     | The thresholds, shared by the monitor and CI                     |
| `provideObservability` | `core/observability/observability.providers.ts` | Assembly: sinks, dev tooling, monitor start                      |
| `MockApiLogger`        | `apps/mock-api/src/logging/logger.ts`           | JSON lines on stdout, same field names, same redaction           |
| `requestLog`           | `apps/mock-api/src/middleware/request-log.ts`   | One line per request, by route template                          |

## 2. A log line

Both sides write one JSON object per line, with the same names for the same things - so
one query over a log store returns the browser's line and the server's line for one
request, without a mapping table.

```json
{"timestamp":"2026-09-30T12:24:14.101Z","level":"debug","message":"HTTP request completed",
 "service":"web","platform":"browser","pageViewId":"90abbd8b-…",
 "method":"GET","url":"/api/customers","durationMs":38,"status":200,
 "correlationId":"6f0c2b1e-…"}

{"timestamp":"2026-09-30T12:24:14.080Z","level":"info","message":"HTTP request completed",
 "service":"mock-api","correlationId":"6f0c2b1e-…",
 "method":"GET","route":"/api/customers","status":200,"durationMs":21,
 "userId":"11111111-…","role":"ADMIN"}
```

| Field                  | Meaning                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `level`                | `debug` · `info` · `warn` · `error`; the threshold is `config.json` `logLevel`   |
| `service`, `platform`  | `web`/`mock-api`; `browser`/`server` (the same code renders in two places)       |
| `correlationId`        | One per request - see §3                                                         |
| `pageViewId`           | One per page load: groups a tab's lines **without identifying the person**       |
| `url` / `route`        | Path only, or the route template (`/api/customers/:id`) - never the query string |
| `durationMs`, `status` | As the side that logs it saw them                                                |

## 3. Correlation ids, end to end

1. `correlationIdInterceptor` (first in the chain) generates a UUID per request, sends it
   as `x-correlation-id` and puts it on the request context.
2. `requestLoggingInterceptor` logs the outcome under that id; an error mapped into the
   taxonomy carries it too (`AppError.correlationId`), so an error report names the
   request that failed.
3. The mock API's `correlationId` middleware **reuses** the incoming id (inventing a
   second one would break the join), echoes it on the response, and `requestLog` writes it
   on the server's line. A request with no id gets a fresh one: nothing is untraceable.
4. Every API error body carries it (`error.correlationId`) - what a user would read out
   to support.

**Proven** by `e2e/observability.spec.ts`: it takes the id from the browser's console
line for the list request and finds exactly one server line with it, via
`GET /api/_mock/logs?correlationId=` - the mock's stand-in for a log aggregator's search.

## 4. What is never logged

Redaction happens **inside the logger, before any sink**, so no call site and no future
sink can skip it. One policy, in `@ecm/contracts`, applied by both loggers (ADR-0038):

- **By key** - credentials (`password`, `*token*`, `secret`, `authorization`, `cookie`,
  `csrf`, `session`, `apiKey`, `credential`) and this domain's personal data (`fullName`,
  `displayName`, `email`, `phone`, `dateOfBirth`, `address`, `line1`, `line2`,
  `postalCode`, `search`, `query`) become `[redacted]`.
- **By value** - anywhere in any string, including the message and an error's text:
  email addresses become `[email]`, JWT-shaped strings and `Bearer …` become
  `[redacted]`. `Error` objects are reduced to name and masked message.

And by construction, before redaction is needed: request **bodies and headers are never
logged**, URLs are logged **without their query string** (a search is a person's name),
and interaction events carry counts and kinds, never records (the `InteractionEvent`
union makes a name or an email a type error).

**Proven** by three tests at three levels: `packages/contracts/test/log-redaction.spec.ts`
(the policy), `core/logging/logger.spec.ts` and `apps/mock-api/test/observability.spec.ts`
(what each side's sink receives), and `e2e/observability.spec.ts` (a real sign-in: the
password and every cookie value are absent from both logs).

What redaction cannot do: recognise a secret with no recognisable key or shape. It is a
net under the rule "log identifiers, not records", not a replacement for it.

## 5. Error tracking

`GlobalErrorHandler` hands every unhandled error to `ErrorTracker.captureError`. The
logging implementation:

- **classifies**: an `AppError` keeps its taxonomy (`kind`, `messageKey`, `status`,
  `correlationId`); an `Error` keeps its name and stack; anything else is recorded as a
  non-error value;
- **fingerprints**: `kind` + message key, or error name + first stack frame - what an
  error tracker groups "issues" by;
- **suppresses repeats**: the same fingerprint within 10 s is counted, not re-logged (an
  error in a change-detection loop fires sixty times a second);
- **attaches breadcrumbs**: the last 20 navigations and interaction events, so the report
  shows how the user got there.

Expected failures are **not** errors here: a 404, a 409 or a validation failure is handled
by the feature that asked, and logged once by the request log - at `warn`. The request
log keeps `error` for a server failure, a lost connection, a timeout or an unclassified
failure, so that alerting on `error` means something. Only what escapes reaches
the tracker.

**Adopting a vendor** (Sentry, Bugsnag, Application Insights): implement `ErrorTracker`
with its SDK and provide it in `provideObservability()`. No call site changes. Its
`beforeSend` hook should run `redactLogValue` from `@ecm/contracts` - the vendor is a
sink like any other.

## 6. Interaction events

`Telemetry.track({ name: 'customers.imported', imported: 2, skipped: 1 })` - an `info`
line (`message: "User interaction"`, `event: …`) and a breadcrumb.

| Event                                      | Data              | Where                        |
| ------------------------------------------ | ----------------- | ---------------------------- |
| `session.signed_in` / `…out`               | role              | `SessionService`             |
| `customer.created` / `updated` / `deleted` | -                 | `CustomerStore`              |
| `customer.status_changed`                  | status            | `CustomerStore` (optimistic) |
| `customers.bulk_action`                    | action, count     | `CustomerStore`              |
| `customers.imported`                       | imported, skipped | `CustomerStore`              |
| `customers.exported`                       | -                 | `CustomerStore`              |
| `preferences.language_changed`             | language          | `LanguageService`            |
| `preferences.theme_changed`                | theme             | `ThemeService`               |

Emitted where the outcome is known (after the server said yes), not where the button is:
a click that failed is not a "created".

## 7. Performance measurements

`PerformanceMonitor` (browser only) measures what [performance.md](performance.md#budgets)
budgets, and logs each measurement at `debug` - or at `warn` with the budget beside it:

| Measurement      | Source                                                    | Budget                 |
| ---------------- | --------------------------------------------------------- | ---------------------- |
| Initial load     | Navigation Timing (TTFB), paint (FCP), LCP observer       | 800 / 1 800 / 2 500 ms |
| Route navigation | `NavigationStart` → `NavigationEnd`, by route template    | 1 000 ms               |
| API latency      | every finished request, by endpoint template; p50/p95/max | 1 000 ms               |
| Long tasks       | `PerformanceObserver('longtask')`; count, total, longest  | 200 ms                 |

LCP and long tasks are Chromium-only APIs; elsewhere they are not measured, and the lab
says so rather than showing zero.

## 8. Where to look

- **In development**: the browser console (JSON lines); the **observability lab**
  (`/technical-labs/observability`) shows the live log, the navigation and API tables and
  the long-task summary, and can throw an unhandled error to show a report with its
  breadcrumbs. The live log is developer tooling, absent from production builds (ADR-0040).
- **The mock API**: stdout (`MOCK_API_LOG_LEVEL`, default `info`; the E2E suites set
  `warn`), and `GET /api/_mock/logs[?correlationId=]` for the last 5 000 entries.
- **In production**: the browser console only. Shipping client logs to a collector is a
  `LogSink` (batched, `sendBeacon` on page hide, warn and above) - not built, because
  there is no collector to send to; listed in the final report.
