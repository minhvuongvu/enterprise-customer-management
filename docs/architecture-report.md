# Architecture report — `phase-7-complete`

The whole-repository review Phase 7 asked for: what the architecture is, measured where it
can be, what the review found and changed, the debt that remains, and what to do next.
Each section is a summary with a pointer to the document that holds the detail.

**Size**: web app 172 source files / 21 300 lines; mock API 27 / 3 100; contracts 15 /
1 200. 42 ADRs. 1 000+ automated tests.

---

## 1. Architecture overview

An Angular 22 application (standalone, signals, zoneless, SSR-scaffolded) and a real
Express mock backend, sharing one Zod contract package, in an npm workspace
(ADR-0001, -0002, -0007, -0008).

```text
apps/web ──▶ packages/contracts ◀── apps/mock-api          (the only shared code)
   │
   ├─ core/          infrastructure, provided once: platform tokens, config, logging,
   │                 observability, errors, http, auth, i18n, realtime, notifications
   ├─ shared/ui/     domain-agnostic components on Angular CDK (no Material)
   ├─ layout/        the shell: header, sidebar/rail/drawer, toasts, confirmation host
   ├─ customers/     the business feature: data/ → state/ → pages
   ├─ technical-labs/ isolated browser experiments - never imported by the product
   └─ login/, forbidden/, not-found/
```

A request's life: component → feature store → API client → `HttpClient` → five
interceptors, one job each (correlation id, request log + latency, refresh-and-retry,
CSRF, error mapping) → fetch (XHR for upload progress) → same-origin `/api` → mock API
middleware (correlation id, request log, CORS, security headers, parsing, fault
injection, latency, rate limit, session) → route → store. docs/architecture.md.

## 2. Dependency graph

Enforced, not described: `lint/architecture.ts` (ADR-0041) runs in `npm run lint` and CI -
**0 cycles across 332 files and 912 internal imports**, and 11 import rules. The web
layer graph, generated from the imports by `node lint/architecture.ts --graph`, is in
docs/architecture.md §2. In words:

- root → features only lazily, through declared entry points; root → core, layout.
- features → core, layout, shared/ui; **never another feature**.
- layout → core, shared/ui; never a feature.
- shared/ui → itself, plus `core/i18n` for number formatting; nothing else.
- core → core only.
- contracts → `zod` only; apps never import each other; `@ecm/contracts/testing` from
  test code only; no Node modules in browser code; no test helper in application code.

## 3. State architecture

| State                     | Owner                                        | Lifetime                                   | Why there                                                 |
| ------------------------- | -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| URL (page, sort, filters) | the router                                   | the address bar                            | shareable, back-button-safe (ADR-0013)                    |
| Customer server state     | `CustomerStore` + `CustomerCache`            | the customer route subtree                 | one store, explicit cache, cancel-by-switch (ADR-0013)    |
| Form state                | reactive form in the page                    | the page                                   | local                                                     |
| Session                   | `SessionService`                             | the app; synced across tabs                | read by guards, directives, interceptors (ADR-0016/-0027) |
| Notifications             | `NotificationService`, `ConfirmationService` | the app                                    | written from anywhere, shown by the shell (ADR-0022)      |
| Preferences               | `LanguageService`, `ThemeService`            | the app; `localStorage`; other tabs follow |                                                           |
| Runtime config and flags  | `AppConfigStore`, `FeatureFlags`             | the app, fixed after start-up              |                                                           |
| Observability             | `PerformanceMonitor`, `ErrorTracker`         | the app                                    | measures across routes by nature                          |

No store library (ADR-0001). One optimistic operation (status change, with rollback,
ADR-0023); everything else waits for the server. Realtime news marks, never overwrites
(ADR-0020). docs/state-management.md.

**Review**: 24 root-provided services. Each has a named reason to be global (above); none
holds feature data - customer data is route-scoped and destroyed on sign-out.

## 4. API architecture

- **One contract**: every request and response is a Zod schema in `@ecm/contracts`; the
  inferred type is the domain type - no mapping layer (ADR-0014). The client validates
  responses; the server validates requests with the same schemas.
- **Errors**: one envelope (`code`, `message`, `correlationId`, `details`), mapped by one
  interceptor into an 11-kind `AppError` taxonomy; users see translation keys, never a
  server message (rule 6). Validation reasons are codes (`fieldIssues`, ADR-0035).
- **Policy per endpoint**: timeouts and retries in `customers/data/request-policy.ts` -
  reads retry, writes never; the one interceptor retry is the refresh (ADR-0017).
- **Concurrency**: `version` on every write; a 409 reloads and resubmits only this user's
  fields (ADR-0015). **Files**: one policy both sides, a byte-signature check only the
  server makes (ADR-0019); CSV import as preview + commit (ADR-0024).
- **Realtime**: SSE with resume-from-last-id, own reconnect and de-duplication (ADR-0006,
  -0020). docs/api-contract.md.

## 5. Testing pyramid

| Level                                                  | Tests                                              | Where                                     |
| ------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| Unit                                                   | web 34 spec files; contracts 45; lint tools 16     | next to the source                        |
| Component                                              | web 14 spec files                                  | next to the component                     |
| Integration (component + store + HTTP; service + HTTP) | web 22 spec files; mock API 133 over a real socket | next to the feature; `apps/mock-api/test` |
| E2E, Chromium                                          | 215 (139 functional, 76 accessibility)             | `e2e/`                                    |
| Production build (+ runtime budgets)                   | 7                                                  | `e2e-production/`                         |
| Visual regression                                      | 14                                                 | `e2e-visual/`, in the Playwright image    |
| Firefox + WebKit                                       | 48 × 2                                             | 5 engine-sensitive specs                  |

Web runs **475** tests (81.5 % lines), the mock API 133 (89.9 %), contracts 45 (98 %);
coverage is gated by ratchet thresholds. **Named gaps**: the shell's notification
components are covered end to end but thin in jsdom (24-41 %); the labs are 38 % in jsdom
by design (browser APIs are tested in a real browser); no real screen reader (debt 29);
bulk `CONFLICT` only by injection; no mutation testing. docs/testing-strategy.md.

## 6. Security architecture

Frontend checks are UX; the mock API enforces independently (rule 10). Session tokens are
`HttpOnly`, `SameSite=Lax` cookies the app never holds (ADR-0016); refresh is single
flight with rotation and replay detection; CSRF double-submit on unsafe requests; CORS
never `*`; security headers on every response; authorization by permission on routes, UI
and actions, and again on every server route (ADR-0018); no `innerHTML`, no sanitizer
bypass (lint). Phase 7 added: one redaction policy for both logs (ADR-0038), a secret
scan in lint and CI, a dependency audit in CI, Dependabot, and reviewed install scripts
(denied). **Open**: no CSP (debt 17 - `autoCsp` is refused with SSR); the mock verifies no
password (by design). docs/security.md.

## 7. Observability architecture

`Logger` (one API) → `StructuredLogger` (level from `config.json`, redaction, common
fields) → `LOG_SINKS` (console; in-memory in dev builds). `ErrorTracker` behind Angular's
`ErrorHandler`: taxonomy, fingerprint, repeat suppression, 20 breadcrumbs - the seam for a
vendor (ADR-0039). `Telemetry`: 11 typed interaction events that cannot carry personal
data. `PerformanceMonitor`: load, navigation, API latency, long tasks against budgets.
One correlation id per request, from the browser's interceptor into the mock API's JSON
log, proven end to end; the mock's `/api/_mock/logs` stands in for a log search.
docs/observability.md.

## 8. Performance strategy

Measure first (`perf/` scripts, medians), then fix, then **gate**: bundle budgets fail
the build (initial 520 kB of 530/540; largest lazy chunk; total JS; nothing flagged
dev-only in the bundle), and runtime budgets fail the production E2E job (TTFB 800 ms,
FCP 1.8 s, LCP 2.5 s, navigation 1 s, API 1 s, long task 200 ms - measured at 8-15 ms,
80-144 ms, 80-144 ms, ≤ 91 ms, ≤ 201 ms, none). The techniques and their before/after
numbers - the zod import fix (−40 %), flagged preloading (−72 %), debouncing, `computed`,
virtual scrolling, image optimization, a Web Worker, `@defer` - are in
docs/performance.md; rendering modes in docs/rendering.md.

## 9. CI pipeline

GitHub Actions, `.github/workflows/ci.yml` (ADR-0042): `quality` (format, eslint, style
rules, architecture, secrets, typecheck, dependency audit) → `unit` (with coverage gates)
and `build` (bundle budgets, optional bundle report) → `e2e` ×2 shards, `accessibility`,
`visual`, `e2e-production` (runtime budgets) → `cross-browser`. Browser jobs run in the
Playwright image, so visual baselines are stable. No secrets, read-only token. Every job
is a gate. docs/ci.md.

## 10. Known technical debt

The register is `docs/PROGRESS.md` (one copy). At `phase-7-complete`:

| #   | Debt                                                                         | Owner                |
| --- | ---------------------------------------------------------------------------- | -------------------- |
| 6   | Fixed-window rate limiter (twice the limit across a boundary)                | documented           |
| 16  | i18n lint allow-list at 18 entries                                           | at ~20               |
| 17  | No Content-Security-Policy (`autoCsp` refused with SSR)                      | Phase 8              |
| 20  | Session end over an unsaved form asks to discard - no re-auth in place       | Phase 8              |
| 21  | Signed-out cold visit sends one failing refresh                              | Phase 8              |
| 26  | SSR server does not compress                                                 | deployment           |
| 27  | Offline snapshot survives on disk if every lab tab closes first              | documented           |
| 29  | No real screen-reader pass                                                   | Phase 8              |
| 30  | `aria-modal` without `inert`                                                 | Phase 8              |
| 31  | CSS glyphs would not mirror under RTL                                        | with an RTL language |
| 32  | Client logs go to the console only - no collector                            | a deployment         |
| 33  | Branch protection (required checks) is a repository setting, not yet applied | repository owner     |
| 34  | WebKit fetches the largest `srcset` candidate for the first, eager lab image | Phase 8              |

Phase 7 paid rows 2 (architecture check), 3 (install scripts), 5 (contracts built first -
CI and every root script build it), 24 (stale pre-bundle - see PROGRESS) and 28 (Firefox
and WebKit).

## 11. Recommended future improvements

In order of value for this repository:

1. **Make the checks required** on the default branch (debt 33) - until then a red CI is
   advice.
2. **CSP with per-request nonces** from the SSR server (debt 17): the last missing layer
   of the XSS defence.
3. **A log collector sink** (debt 32): batch `warn`+ entries, `sendBeacon` on page hide,
   through the same redaction - and an `ErrorTracker` backed by a real service with source
   maps. The seams exist; the destination does not.
4. **Split `CustomerListPage`** (768 lines: filters, table/cards, bulk bar, export,
   action menu, focus return): its children already exist; the orchestration of export
   and bulk could move to a small page-level service. Not done in Phase 7 because no
   defect or test pain called for it - a refactor with no failing test is taste.
5. **Mutation testing** (Stryker) on `customer-form-model.ts`, `customer-store.ts` and
   `core/http` - where a surviving mutant would mean a real, silent bug.
6. **Real-user monitoring**: send the `PerformanceMonitor`'s numbers (sampled) to the
   collector; the CI budgets measure a lab, not users.
7. **A custom i18n lint rule** once the allow-list passes ~20 (debt 16).
8. **Run the full E2E suite in Firefox and WebKit nightly** rather than five specs per
   push.

## Review findings and what changed

The review looked for circular dependencies, duplicated logic, inappropriate shared
components, oversized components, overloaded services, needless global state, feature
leakage, infrastructure in the UI and excess abstraction.

| Finding                                                                                                    | Action                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The root imported the labs' guard - reaching into a feature's internals                                    | Replaced by `featureEnabled()` in `core/config`; the guard file is gone                                              |
| A customer record hand-copied into the offline lab's spec (rule 4 forbade borrowing the feature's fixture) | Test data moved to `@ecm/contracts/testing`, validated against the schema                                            |
| Endpoint-template logic written twice in Phase 7 (web and mock API)                                        | One `endpointTemplate` in the contracts, used by both logs                                                           |
| Redaction lists: one partial, one missing                                                                  | One policy in the contracts (ADR-0038)                                                                               |
| A build-time flag that did not remove its code                                                             | `fileReplacements`, and a budget check that proves it (ADR-0040)                                                     |
| The dropdown's check mark rendered as "¹3" since Phase 6                                                   | Fixed; the visual suite now holds it                                                                                 |
| `CustomerListPage` and `CustomerStore` are the largest files (768, 705 lines)                              | Kept: each is one responsibility with many states; see recommendation 4                                              |
| No cycles; no `HttpClient` outside API clients; no feature leakage; no dumping-ground folders              | Now enforced by the architecture check                                                                               |
| Global state                                                                                               | 24 root services, each with a stated reason; none holds feature data                                                 |
| Excess abstraction                                                                                         | None removed. The two added (`LogSink`, `ErrorTracker`) each name a second implementation (in-memory sink; a vendor) |
