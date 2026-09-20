# Angular Enterprise Learning Project

## 1. Project Purpose

This project is an **enterprise-oriented Angular learning repository**.

The goal is not simply to build a CRUD application. The project uses a small, realistic business domain to create a codebase that exposes the architectural patterns, engineering practices, and technical problems commonly encountered when working with large Angular applications.

The primary learning objectives are:

- Learn how a modern Angular application is structured at enterprise scale.
- Learn how to reason about component boundaries, state ownership, data flow, side effects, routing, and rendering.
- Learn how frontend applications communicate with APIs and manage server state.
- Learn authentication, authorization, security, error handling, and resilience.
- Learn forms, validation, dialogs, notifications, file handling, realtime updates, and other enterprise UX patterns.
- Learn performance, accessibility, responsive design, internationalization, observability, testing, and CI/CD.
- Learn how to read and modify an existing enterprise Angular codebase.
- Practice making architectural decisions and understanding trade-offs instead of blindly applying patterns.
- Use Claude Code as an implementation assistant while keeping architecture understandable and reviewable by a human developer.

The project should therefore be **small in business scope but deep in technical scope**.

Do not turn the application into a collection of unrelated Angular demos. Core enterprise techniques should be integrated into a coherent business application where they naturally belong. Techniques that do not naturally belong in the business flow should be implemented as isolated technical labs.

---

## 2. Business Domain

The primary business domain is **Customer Management**.

The application should provide a realistic customer-management workflow while remaining small enough that the technical architecture can be studied in detail.

### Core Customer Model

A customer may contain:

- `id`
- `customerCode`
- `fullName`
- `email`
- `phone`
- `dateOfBirth`
- `gender`
- `status`
- `address`
- `avatar`
- `tags`
- `createdAt`
- `updatedAt`
- `createdBy`
- `updatedBy`

The exact model may evolve as later phases require additional enterprise scenarios.

---

## 3. Functional Requirements

### 3.1 Authentication

The application must support:

- Login
- Logout
- Current authenticated user
- Session expiration
- Authentication state
- Access token / refresh-token style flow where appropriate
- Handling authentication failure
- Redirecting unauthenticated users to login
- Preserving the intended destination when appropriate

Authentication may use a mock backend, but the frontend architecture should resemble a production application.

---

### 3.2 Authorization

The application must support role/permission-based authorization.

Example roles:

- `ADMIN`
- `MANAGER`
- `VIEWER`

Example permissions:

- `CUSTOMER_READ`
- `CUSTOMER_CREATE`
- `CUSTOMER_UPDATE`
- `CUSTOMER_DELETE`
- `CUSTOMER_IMPORT`
- `CUSTOMER_EXPORT`

Authorization must be demonstrated at multiple levels:

- Route access
- UI visibility
- Action availability
- API/backend enforcement

Frontend authorization must **not** be treated as the actual security boundary.

---

### 3.3 Customer List

Users must be able to:

- View customers
- Search customers
- Filter customers
- Sort customers
- Paginate customers
- Refresh data
- Select individual customers
- Select multiple customers
- Perform supported bulk actions
- See loading, refreshing, empty, and error states

List state that is meaningful to navigation should be represented in the URL where appropriate.

Example:

`/customers?page=2&size=20&search=john&status=ACTIVE&sort=updatedAt,desc`

The URL should be treated as a source of navigational state, not merely an implementation detail.

---

### 3.4 Customer Detail

Users must be able to:

- Open a customer detail page
- View customer information
- View related activity where appropriate
- View audit information
- Navigate to edit
- Delete a customer when authorized

Example route:

`/customers/:id`

---

### 3.5 Create Customer

Users with appropriate permission must be able to:

- Open a create form
- Enter customer information
- Validate fields
- Receive validation feedback
- Submit the form
- Handle server-side validation errors
- Handle duplicate/conflict errors
- Handle network/server failures
- Cancel/reset the form

Example route:

`/customers/new`

---

### 3.6 Edit Customer

Users with appropriate permission must be able to:

- Open an edit form
- Load existing customer data
- Modify customer information
- Validate changes
- Submit updates
- Handle server-side validation
- Handle concurrent modification/conflict scenarios
- Cancel changes
- Detect unsaved changes

Example route:

`/customers/:id/edit`

The application should protect users from accidentally losing unsaved changes where appropriate.

---

### 3.7 Delete Customer

Users with appropriate permission must be able to:

- Delete a customer
- Receive a confirmation dialog
- Handle success
- Handle failure
- Handle not-found/conflict scenarios
- Refresh or reconcile affected UI state

---

### 3.8 Bulk Operations

Where appropriate, users must be able to perform bulk operations such as:

- Activate
- Deactivate
- Delete

The UI should clearly communicate:

- Selection state
- Operation progress
- Partial failure
- Success
- Failure

---

### 3.9 File Upload

The application should demonstrate enterprise file-upload patterns using customer avatars or similar customer-related files.

Support where appropriate:

- File selection
- Drag and drop
- File type validation
- File size validation
- Preview
- Upload progress
- Cancellation
- Retry
- Server errors

Security implications of uploaded files must be considered.

---

### 3.10 Import / Export

The application should support customer data import/export.

Import should demonstrate:

- File selection
- Parsing
- Preview
- Validation
- Row-level errors
- Partial success
- Import progress/status
- Final result

Export should demonstrate:

- Permission checking
- Request initiation
- Download handling
- Error handling

---

### 3.11 Notifications

The application should support:

- Toast/snackbar notifications
- Notification center
- Unread count
- Read/unread state
- Success notifications
- Error notifications
- Informational notifications

Notifications should be implemented as an application concern rather than duplicated independently across features.

---

### 3.12 Realtime Updates

The application should demonstrate realtime communication using an appropriate mechanism such as WebSocket or SSE.

Examples:

- Customer updated by another user
- Customer status changed
- Import/export completed
- System notification received

The application should handle:

- Connection state
- Reconnection
- Duplicate events
- Cleanup
- Failure
- Stale data
- Conflict with local edits

---

### 3.13 Audit Log

The application should provide an audit view for customers.

Example route:

`/customers/:id/audit`

Audit information may include:

- Actor
- Action
- Timestamp
- Changed fields
- Previous value
- New value

Sensitive information must not be unnecessarily exposed.

---

### 3.14 Technical Labs

Some browser and frontend techniques do not naturally belong in Customer Management.

Create an isolated `technical-labs` area for such experiments.

Possible labs include:

- Browser Storage
- IndexedDB
- History API
- URL API
- Clipboard API
- File API
- Web Worker
- Service Worker
- Browser permissions
- Geolocation
- Offline/connectivity
- BroadcastChannel
- Cross-tab synchronization
- Leader election
- Rendering experiments
- Performance experiments
- Realtime experiments

Technical labs must remain isolated from the core Customer Management architecture unless there is a deliberate reason to integrate them.

---

## 4. Non-Functional Requirements

### 4.1 Maintainability

The codebase must be designed so that another developer can:

- Understand the architecture
- Locate feature-specific code quickly
- Add a new feature without modifying unrelated features
- Replace infrastructure implementations with minimal impact
- Understand state ownership
- Understand data flow
- Understand dependencies between modules

Prefer clear boundaries over clever abstractions.

---

### 4.2 Extensibility

The architecture should make it reasonably easy to add:

- New customer fields
- New customer operations
- New permissions
- New API endpoints
- New UI components
- New technical labs
- New business features

Avoid abstractions that exist only to demonstrate abstraction.

---

### 4.3 Feature-Oriented Architecture

Prefer feature-oriented organization over a generic global structure such as:

- `components/`
- `services/`
- `models/`
- `utils/`

Feature-specific logic should remain close to its feature.

A conceptual structure may look like:

```text
src/app/
├── core/
│   ├── auth/
│   ├── http/
│   ├── error/
│   ├── config/
│   ├── logging/
│   └── security/
│
├── shared/
│   ├── ui/
│   ├── forms/
│   ├── directives/
│   └── pipes/
│
├── customers/
│   ├── customer-list/
│   ├── customer-detail/
│   ├── customer-form/
│   ├── customer-audit/
│   ├── customer.store.ts
│   ├── customer.api.ts
│   ├── customer.models.ts
│   └── customer.routes.ts
│
├── notifications/
│
├── technical-labs/
│   ├── browser/
│   ├── realtime/
│   ├── offline/
│   ├── cross-tab/
│   └── rendering/
│
└── app.routes.ts
```

The exact structure may change when implementation reveals a better boundary.

---

### 4.4 Dependency Boundaries

Dependencies should have clear direction.

General principles:

```text
UI / Presentation
        ↓
Feature / Application State
        ↓
API / Infrastructure
        ↓
External Systems
```

Shared infrastructure must not depend on concrete business features.

Features should not randomly import implementation details from other features.

Avoid circular dependencies.

If cross-feature communication is necessary, use an explicit application-level contract or shared abstraction rather than creating hidden coupling.

---

### 4.5 State Management

State ownership must be explicit.

Distinguish at least:

- Local UI state
- Form state
- URL/navigation state
- Server state
- Shared application state
- Derived state

Do not put every state into a global store.

Use the simplest state mechanism that correctly represents the ownership and lifecycle of the state.

Signals and other modern Angular mechanisms should be used where they improve clarity rather than merely because they are available.

---

### 4.6 API and Server-State Architecture

Components should not directly contain HTTP communication logic.

Prefer separation between:

- Presentation
- Application/feature state
- API/data-access
- Infrastructure

The mock API should behave realistically enough to expose frontend engineering problems.

It should be capable of simulating:

- Pagination
- Sorting
- Filtering
- Search
- Latency
- Validation errors
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `409 Conflict`
- `500 Internal Server Error`
- Network failure

---

### 4.7 Error Handling

Errors must be handled deliberately.

The application should distinguish between:

- Validation errors
- Authentication errors
- Authorization errors
- Not found
- Conflict
- Rate limiting where relevant
- Server errors
- Network errors
- Timeout
- Cancellation
- Unknown/unexpected errors

Error handling should have a consistent application-wide strategy while still allowing feature-specific behavior.

Avoid displaying raw backend errors directly to users.

---

### 4.8 Performance

The application should demonstrate reasonable enterprise frontend performance practices, including where appropriate:

- Lazy loading
- Code splitting
- Efficient rendering
- Avoiding unnecessary change detection/rendering work
- Debouncing/throttling
- Request cancellation
- Memoization where justified
- Virtual scrolling for large collections
- Image optimization
- Bundle analysis
- Performance budgets

Do not optimize prematurely. Performance techniques should be introduced when there is a meaningful reason or a dedicated technical lab.

---

### 4.9 Accessibility

The application should target strong accessibility practices.

Consider:

- Semantic HTML
- Keyboard navigation
- Focus management
- Focus trapping for dialogs
- Screen-reader support
- Appropriate ARIA
- Accessible form validation
- Accessible tables
- Accessible notifications
- Accessible loading/error states
- Color contrast
- Reduced-motion preferences

Accessibility must be considered as part of component design, not added only at the end.

---

### 4.10 Responsive Design

The application must work across:

- Desktop
- Tablet
- Mobile

Responsive behavior should be intentional.

Do not merely shrink the desktop UI.

Important interactions such as tables, forms, navigation, dialogs, and action menus should remain usable on smaller screens.

---

### 4.11 Internationalization

The application should support at least:

- English
- Vietnamese

It should consider:

- Text translation
- Date formatting
- Number formatting
- Currency formatting
- Pluralization
- Locale-sensitive sorting/formatting where relevant

The architecture should avoid hard-coding user-visible strings throughout feature code.

Prepare the design so RTL support could be introduced later without major architectural changes.

---

### 4.12 Security

Security must be treated as a system-level concern.

Consider:

- XSS
- CSRF
- CORS
- Content Security Policy
- Secure cookie/token handling
- SameSite cookies
- File-upload security
- Sensitive data exposure
- Authentication
- Authorization
- Dependency vulnerabilities
- Browser security policies

Clearly distinguish responsibilities between:

- Angular/frontend
- Backend/API
- Reverse proxy/web server
- Browser

Do not claim that a frontend-only mechanism provides backend security.

---

### 4.13 Testing

Testing should exist at multiple levels:

- Unit tests
- Component tests
- Integration tests
- End-to-end tests
- Accessibility tests
- Architecture/dependency checks where useful

Tests should focus on behavior and contracts rather than implementation details.

Important business flows should have E2E coverage.

Tests should be deterministic and maintainable.

---

### 4.14 Observability

The application should demonstrate frontend observability practices such as:

- Structured client-side logging
- Error tracking concepts
- API latency measurement
- Performance metrics
- Correlation/request identifiers
- Important user interaction telemetry

Never log secrets, tokens, passwords, or unnecessary sensitive customer information.

---

### 4.15 CI/CD and Developer Experience

The repository should provide a predictable development workflow.

At minimum, CI should be capable of running:

```text
Install dependencies
        ↓
Lint
        ↓
Type check
        ↓
Unit/component tests
        ↓
Build
        ↓
E2E tests
        ↓
Accessibility checks
        ↓
Optional bundle/performance checks
```

The repository should include clear scripts and documentation for:

- Local development
- Testing
- Building
- Linting
- Formatting
- E2E testing
- Environment configuration

---

## 5. Locked Technical Decisions

This section exists so that every implementation session makes the **same** technology choices.

Anything marked **LOCKED** must not be changed by an implementation phase. It may only be changed by writing a new ADR in `docs/decisions/` that explicitly supersedes `0001-locked-technical-stack.md`.

Versions below were verified against the npm registry on **2026-09-20**. Phase 0 must re-verify at install time and record the actually resolved versions in ADR-0001.

---

### 5.1 Runtime prerequisite (BLOCKING)

Angular 22 requires Node `^22.22.3 || ^24.15.0 || >=26.0.0`.

The machine on which this plan was authored had **Node v20.18.0, which cannot run Angular 22.**

Phase 0 must check `node -v` as its first action and stop with a clear message if the runtime is too old.

Do not work around this by downgrading Angular.

---

### 5.2 Locked stack

| Concern | Decision | Verified version | Reason |
|---|---|---|---|
| Framework | Angular — standalone + signals | `22.1.7` | Latest stable |
| Language | TypeScript, `strict` + `strictTemplates` | `6.0.3` | Angular 22 requires `>=6.0 <6.1`. **TypeScript 7 is NOT compatible** |
| Unit / component tests | Vitest via the first-party Angular builder | `4.1.11` | `@angular/build` peer-requires `vitest ^4.0.8`. Karma is deprecated. **Vitest 5 is NOT compatible** |
| E2E | Playwright | `1.63.0` | Multi-browser, trace viewer, same runner reused for a11y |
| Accessibility testing | `@axe-core/playwright` | `4.13.0` | Runs inside the E2E suite, not as a separate stack |
| Lint | ESLint + `angular-eslint` | `10.11.0` / `22.5.0` | |
| Format | Prettier | `3.9.8` | |
| UI primitives | Hand-written components **on top of Angular CDK** | `22.1.7` | CDK solves focus trap / overlay / virtual scroll correctly; composition is still written by hand and therefore still taught. **No Material, no PrimeNG** |
| i18n | Transloco | `8.4.0` | Runtime language switching is required (3.11 / Phase 6). `@angular/localize` is build-time-per-locale and cannot switch at runtime |
| Contracts & validation | Zod | `4.6.5` | One schema shared by mock API and frontend; runtime validation of API responses |
| Mock backend | Node + Express | `5.2.1` | Must be a real HTTP server — see 5.4 |
| Monorepo | npm workspaces (**no Nx**) | npm `11.x` | Three packages is not a monorepo problem |
| Server state | No store library — per-feature signal store + explicit cache | — | See 5.5 |

---

### 5.3 Repository layout (LOCKED)

```text
apps/
  web/          Angular application
  mock-api/     Express mock backend (a real server, not an interceptor)
packages/
  contracts/    Zod schemas + inferred DTO types + shared fixtures
docs/
  decisions/    ADRs
  PROGRESS.md   phase log, deviations, technical-debt register
prompts/        phase prompts
```

`packages/contracts` is the single source of truth for the API shape.

Dependency direction is strictly: `apps/web → packages/contracts ← apps/mock-api`.

`packages/contracts` must never import from `apps/*`.

---

### 5.4 The mock backend is a real HTTP server (LOCKED)

The mock API must **not** be implemented as an Angular `HttpInterceptor` or an in-memory stub inside the Angular app.

It is a separate Express process, because the following requirements are otherwise impossible to implement honestly rather than merely simulate:

- `HttpOnly` cookies, `SameSite`, CSRF double-submit — Phase 3
- Real CORS preflight behaviour — Phase 3
- Real security headers / CSP — Phase 3
- Server-side authorization enforcement — Phase 3
- Real upload progress, multipart handling — Phase 4
- WebSocket / SSE — Phase 4
- Large dataset latency and pagination cost — Phase 5

A frontend-only mock would force Phase 3 to *claim* security properties it does not have, which section 4.12 explicitly forbids.

---

### 5.5 Server state (LOCKED for now)

No global store library is introduced initially.

Instead:

- one signal-based store per feature, owning that feature's server state
- an explicit cache keyed by the normalised query (page, size, sort, filters)
- documented invalidation rules — every mutation states what it invalidates
- Angular's `resource()` / `httpResource()` APIs may be used where they genuinely fit; Phase 0 must verify their availability and stability in the installed version before relying on them

This decision is revisited **once**, at Phase 4, when realtime + optimistic updates apply real pressure to the cache. If the hand-written cache breaks down there, adopting NgRx SignalStore is allowed — via an ADR that documents what specifically broke.

---

### 5.6 Rendering / SSR is decided in Phase 0, not Phase 5 (LOCKED)

The application is scaffolded **with SSR enabled** in Phase 0.

Rationale: SSR cannot be retrofitted cheaply. Four phases of direct `window` / `document` / `localStorage` access would make Phase 5 a repository-wide refactor, which contradicts the Phase 5 instruction not to modify the core feature.

However, SSR is **not** used to serve the authenticated application:

- public surface (`/login`, any marketing/error route) — prerendered
- authenticated application — client-rendered with hydration
- Phase 5 then *measures and compares* rendering modes instead of introducing them

The real benefit taken in Phase 0 is enforcement: no direct browser-global access anywhere in the app.

---

### 5.7 Cross-cutting seams established in Phase 0 (LOCKED)

These are the concerns that do not retrofit cheaply. Phase 0 creates the **seam**; later phases fill it in.

| Seam | Created in Phase 0 | Filled in |
|---|---|---|
| i18n | translation service + pipe, `en` only, **no hardcoded user-facing strings from the first line of code** (enforced by lint) | Phase 6 |
| Logging / observability | `Logger` abstraction + correlation ID generated in the HTTP layer | Phase 7 |
| Platform safety | injection tokens for `window` / `document` / storage; direct global access banned by lint | Phase 5/6 |
| Error handling | the error taxonomy of 4.7 as a real discriminated union + central mapping | every phase |
| Auth | `SessionService` skeleton + `authGuard` returning `true`, wired into routes | Phase 3 |
| Feature flags | minimal flag service reading runtime config | Phase 7 |
| Time & timezone | **policy:** all instants stored/transported as UTC ISO-8601 and rendered through the locale service; `dateOfBirth` is a date-only value and must never be timezone-shifted | Phase 6 |

A seam is a few dozen lines. It is not an implementation of the later phase, and must not become one.

---

### 5.8 Deliberately NOT used

- Nx, Turborepo — three workspaces do not need a build orchestrator
- Microfrontends, module federation
- Angular Material, PrimeNG, or any component library other than CDK
- NgRx / NGXS / Akita — unless 5.5 is revisited via ADR
- Karma, Protractor, Cypress
- TypeScript 7, Vitest 5 — incompatible with Angular 22
- `@angular/localize` as the runtime translation mechanism
- More than one state-management approach at the same time

---
## 6. Angular Engineering Requirements

Use a modern Angular architecture appropriate for the current project version.

Prefer:

- Standalone components
- Feature-oriented architecture
- Lazy-loaded routes
- Strong TypeScript typing
- Dependency injection
- Signals where appropriate
- Modern Angular template syntax where appropriate
- Functional guards/interceptors where appropriate
- Clear component boundaries
- Explicit state ownership
- Reusable UI primitives
- Testable application logic

Avoid:

- Large god components
- Large god services
- Global state for everything
- Excessive inheritance
- Excessive generic abstractions
- `utils` dumping grounds
- Feature logic inside shared components
- Direct HTTP calls scattered throughout UI components
- Hidden cross-feature dependencies
- Abstractions created solely to demonstrate design patterns

---

## 7. Enterprise Web Development Coverage

The project should progressively expose the following areas:

1. Routing & Navigation
2. UI Components & Composition
3. State Management
4. User Input & Forms
5. HTTP & API
6. Authentication & Authorization
7. Security
8. Data Fetching & Server State
9. Feedback & Notifications
10. Dialogs & Overlays
11. User Interaction
12. Rendering
13. Browser & Client Capabilities
14. Realtime
15. File & Media
16. Search & Discovery
17. Data Presentation
18. Performance
19. Error & Failure Handling
20. Lifecycle & Async
21. Responsive & Adaptive UI
22. Accessibility
23. Internationalization
24. SEO & document metadata — *scoped down, see below*
25. Offline & Connectivity
26. Analytics & Observability
27. Testing
28. Styling & Design System
29. State Synchronization & Cross-Tab
30. Application Architecture & Developer Experience
31. Web Security & Browser Protections
32. Architecture & Codebase Engineering

Not every topic must be forced into the Customer Management feature.

Use the following rule:

> If a technique naturally belongs to the business flow, integrate it into Customer Management. If it does not naturally belong there, demonstrate it in `technical-labs`.

### 7.1 Scope note — SEO (item 24)

Customer Management is an authenticated back-office application. Classic SEO does not apply to it and must not be used to justify SSR (see 5.6).

Item 24 is therefore deliberately scoped down to what is actually real for this kind of product:

- correct `<title>` and document metadata per route, updated on navigation
- correct document `lang` attribute, kept in sync with the active locale
- accurate heading hierarchy and landmarks — this is shared with accessibility
- `robots` / `noindex` on authenticated routes, which is the correct SEO behaviour here
- Open Graph / crawlable metadata only on the public surface (`/login`, error pages)

Anything beyond that — sitemaps, structured data, canonical-URL strategy, crawl budget — is demonstrated once in `technical-labs/seo` on the public surface, or not at all. Do not fabricate SEO work for screens that no crawler will ever reach.

---

## 8. Learning-Oriented Constraints

This repository is also a learning artifact.

Therefore:

### Prefer explicitness over cleverness

The code should make architectural concepts visible.

A slightly more explicit implementation is acceptable if it makes an important enterprise concept easier to understand.

### Avoid artificial complexity

Do not introduce:

- Microservices
- Microfrontends
- Excessive design patterns
- Multiple state-management libraries
- Complex infrastructure

unless the technique is directly relevant to the learning objective.

### Avoid fake enterprise architecture

The application should not become an unnecessarily complicated imitation of a large corporation's codebase.

The target is:

> Realistic enterprise patterns + small understandable business scope.

### Preserve architectural intent

Important architectural decisions should be documented.

When there is a significant trade-off, document:

- Problem
- Options considered
- Decision
- Reason
- Consequences

Use ADRs when appropriate.

---

## 9. Claude Code Working Rules

Claude Code should treat this document as the **project-level source of truth** for product scope and engineering intent.

`CLAUDE.md` in the repository root is the short operating manual that points here. It is the file Claude Code loads automatically; this document is the authority it defers to.

Every session starts with no memory of previous sessions. `docs/PROGRESS.md` is therefore the state file: it records what each phase actually built, what deviated from the plan, and what debt was accepted. It must be read at the start of a phase and updated at the end of one.

Before implementing a phase:

0. Read `docs/PROGRESS.md`, then section 5 of this document and the ADRs in `docs/decisions/`.
1. Inspect the existing repository.
2. Understand the current architecture.
3. Identify existing patterns and constraints.
4. Check the current implementation against this document.
5. Plan the smallest coherent change required by the phase.
6. Implement only the requested scope.
7. Run relevant tests and quality checks.
8. Review the resulting architecture.
9. Update documentation when architectural behavior changes.
10. Update `docs/PROGRESS.md` and commit on the phase branch.

Every phase prompt ends with a **Definition of Done**. A phase is complete only when every item in it genuinely holds. Report a failing check as failing, with its output — never tick an item that is not true. A phase reported as done while a check is broken causes the next phase to build on a false assumption, which is the most expensive failure mode in this repository.

Do not rewrite the project simply because another architecture is possible.

Do not introduce unrelated refactoring during feature implementation.

When a requirement conflicts with an existing architectural decision:

1. Identify the conflict.
2. Explain the trade-off.
3. Prefer the smallest change that preserves architectural consistency.
4. Update the relevant documentation/ADR if the decision changes.

---

## 10. Phase-Based Development

The project is expected to evolve incrementally.

A recommended progression is:

### Phase 0 — Foundation & Architecture

Establish:

- Project structure
- Angular configuration
- TypeScript strictness
- Formatting/linting
- Testing foundation
- Routing foundation
- HTTP foundation
- Error foundation
- Configuration
- Shared UI foundation
- Architecture documentation
- SSR scaffolding and platform-safety tokens (5.6)
- Cross-cutting seams: i18n, logging/correlation ID, error taxonomy, auth skeleton, feature flags, time policy (5.7)

Do not implement the complete Customer CRUD yet.

### Phase 0.5 — Mock API & Contracts

Establish:

- npm workspaces layout (5.3)
- `packages/contracts` — Zod schemas, inferred DTO types, shared fixtures
- `apps/mock-api` — a real Express server (5.4)
- deterministic seed data at realistic scale
- fault injection and scenario control
- shared user fixtures used by auth, `createdBy`/`updatedBy` and audit

This phase exists because Phases 2, 3, 4 and 5 all depend on backend behaviour that a frontend-only mock cannot provide.


### Phase 1 — Routing, Layout & Design System

Implement:

- Application shell
- Navigation
- Routes
- Route parameters/query parameters
- Responsive layout
- Shared UI primitives
- Design tokens
- Themes
- Accessibility foundations

### Phase 2 — Customer CRUD, Forms & Server State

Implement:

- Customer list
- Search/filter/sort/pagination
- Detail
- Create
- Edit
- Delete
- Bulk operations
- Reactive forms
- Validation
- API layer
- Server state
- URL state
- Error/loading/empty states

### Phase 3 — Authentication, Authorization & Security

Implement:

- Login/logout
- Session handling
- Guards
- Permissions
- Interceptors
- Authentication failures
- Authorization
- Security demonstrations

### Phase 4 — Enterprise UX, Files, Notifications & Realtime

Implement:

- File upload
- Import/export
- Notifications
- Audit log
- Realtime
- Optimistic updates
- Conflict handling

### Phase 5 — Performance, Rendering, Offline & Browser APIs

Use technical labs for:

- Rendering-mode comparison (CSR / SSR / hydration / prerender) — SSR is already configured in Phase 0 per 5.6, so this phase *measures and compares*, it does not introduce it
- Rendering behavior
- Performance
- Browser APIs
- Offline
- IndexedDB
- Service Worker
- Web Worker
- Cross-tab synchronization

### Phase 6 — Accessibility, i18n, Design System & UX Quality

Deepen:

- Accessibility
- Responsive behavior
- i18n
- Design system
- UX consistency
- Keyboard/focus behavior

### Phase 7 — Observability, Testing, CI/CD & Hardening

Add:

- Testing strategy
- Observability
- Performance budgets
- CI/CD
- Quality gates
- Architecture checks
- Feature flags
- Environment management

### Phase 8 — Enterprise Codebase Review

Perform a final architecture review focused on:

- Maintainability
- Extensibility
- State ownership
- Dependency boundaries
- Angular patterns
- API architecture
- Security
- Performance
- Accessibility
- Testing
- Developer experience
- Technical debt
- Transferability to real enterprise Angular codebases

---

## 11. Architecture Review Principle

After each phase, the repository should be reviewed before moving to the next phase.

The review should answer:

- What architecture was introduced?
- Which Angular patterns are being used?
- Which patterns are incorrect?
- Which patterns are unnecessary?
- What is over-engineered?
- What is too simplistic?
- Are dependency boundaries clean?
- Are there circular dependencies?
- Is state ownership clear?
- What technical debt was introduced?
- What should be fixed before the next phase?
- What should intentionally remain unchanged?

Do not judge the repository against an imaginary "perfect enterprise architecture".

Judge it against:

1. The current phase
2. The upcoming phases
3. The project's learning objectives
4. The intended enterprise use cases
5. The complexity that is actually justified

---

## 12. Definition of Success

The project is successful when a developer can use it to learn how to:

- Navigate an unfamiliar Angular enterprise repository
- Identify application entry points
- Understand route structure
- Trace a user interaction through the UI
- Identify where state lives
- Trace state changes
- Trace API calls
- Understand error handling
- Understand authentication/authorization flow
- Identify feature boundaries
- Identify shared infrastructure
- Understand dependency direction
- Modify an existing feature safely
- Add a new feature without unnecessary coupling
- Diagnose common frontend issues
- Understand why a given architectural decision was made

The final codebase should therefore be judged not only by whether the application works, but also by whether its architecture is **understandable, realistic, maintainable, and educational**.
