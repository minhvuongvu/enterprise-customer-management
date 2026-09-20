Continue working on the existing Angular enterprise learning repository.

This is Phase 1.

## Objective

Build the application shell, routing architecture, layout system, and reusable UI/design-system foundation.

Do not implement the complete Customer CRUD yet.

## Required Routes

Create the following route structure:

/login

/customers
/customers/new
/customers/:id
/customers/:id/edit
/customers/:id/audit

Create a technical-lab area:

/technical-labs

with placeholder child routes for future experiments.

Use lazy loading appropriately.

## Routing Requirements

Demonstrate:

- route configuration
- lazy loading
- route parameters
- query parameters
- nested routes
- redirects
- wildcard / not-found route
- navigation
- browser history
- deep linking
- route metadata

Do not implement authentication logic yet, but design the routes so route guards can be introduced later without restructuring the application.

## Application Layout

Create:

- application shell
- header
- sidebar/navigation
- main content area
- responsive layout
- page container
- breadcrumbs
- page header
- action area

The layout must support:

Desktop
Tablet
Mobile

The mobile layout should be adaptive rather than merely shrinking the desktop layout.

## Shared UI

Create a small reusable UI foundation.

Examples:

- Button
- Input
- Select
- Badge
- Spinner
- Skeleton
- EmptyState
- ErrorState
- Dialog
- Dropdown
- Tooltip
- Pagination
- Table primitives

Do not build a giant design system.

Only create components that are actually useful to the application.

## Component Architecture

Demonstrate:

- componentization
- reusable components
- composition
- inputs
- outputs
- conditional rendering
- dynamic rendering where appropriate
- content projection
- layout components
- shared UI patterns

Avoid putting business logic into generic UI components.

Generic components must remain domain-agnostic.

## Styling

Implement:

- CSS variables
- design tokens
- spacing scale
- typography tokens
- border/radius tokens
- surface tokens
- light theme
- dark theme

Support runtime theme switching.

Prefer CSS variables over hardcoded repeated values.

## Accessibility

All reusable UI components must consider:

- semantic HTML
- keyboard interaction
- focus
- focus visibility
- ARIA where required
- accessible labels
- disabled states
- reduced motion

Dialogs must implement correct focus management.

## Testing

Add tests for important shared components.

At minimum:

- Button
- Input
- Dialog
- Dropdown
- Pagination

Test behavior rather than implementation details.

## Required Documentation

Update architecture documentation with:

- routing architecture
- layout architecture
- shared UI rules
- design token strategy
- component composition rules

## Workflow

Before implementation:

1. Inspect Phase 0.
2. Understand existing architecture.
3. Identify reusable infrastructure.
4. Produce implementation plan.

After implementation:

- format
- lint
- typecheck
- unit/component tests
- E2E smoke test
- review dependency boundaries

Do not implement Customer API/state/business logic yet.

Report all changes and test results.

---

## Definition of Done

Do not report this phase as complete until every item holds. Report any failing item as failing, with its output. Never mark a phase done with a known-broken check.

- [ ] `npm run format` clean
- [ ] `npm run lint` — zero errors, zero new warnings
- [ ] `npm run typecheck` clean under `strict` + `strictTemplates`
- [ ] `npm run test` passing, meaningful assertions, no `.skip` left behind
- [ ] `npm run build` succeeds, including the server build
- [ ] `npm run e2e` passing
- [ ] The non-negotiable rules in `CLAUDE.md` hold for all new code
- [ ] No circular dependencies introduced
- [ ] No later-phase scope implemented, and no unrelated refactoring
- [ ] Every required route resolves, including the wildcard/not-found route and deep links
- [ ] `authGuard` from Phase 0 is wired into the route tree and can be made real in Phase 3 without restructuring
- [ ] Layout verified at desktop, tablet and mobile widths — adaptive, not a shrunken desktop
- [ ] Dialog implements focus trap, Escape to close, and focus restore to the trigger — verified by test
- [ ] Every shared component is fully operable by keyboard with a visible focus indicator
- [ ] Runtime theme switching works, light and dark, with no hardcoded colors outside the tokens
- [ ] Zero hardcoded user-facing strings — everything goes through the translation layer
- [ ] No business logic in any generic UI component
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-1` and tagged
