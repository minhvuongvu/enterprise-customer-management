Continue working on the existing Angular enterprise learning repository.

This is Phase 6.

## Objective

Raise the application's UX quality to an enterprise production standard.

Focus on:

- accessibility
- responsive/adaptive design
- internationalization
- design system consistency
- keyboard interaction
- focus management
- visual consistency

## Accessibility

Audit the complete application.

Check:

- semantic HTML
- heading hierarchy
- labels
- form errors
- keyboard navigation
- focus management
- dialogs
- dropdowns
- tables
- pagination
- notifications
- status messages
- ARIA
- screen reader behavior
- contrast
- reduced motion

Test the application using keyboard-only navigation.

## Responsive Design

Test:

- desktop
- tablet
- mobile

Do not simply shrink desktop layouts.

Use adaptive UI where appropriate.

Examples:

Desktop table
→ Mobile card/list

Desktop sidebar
→ Mobile navigation

Desktop multi-column form
→ Mobile single-column form

## Internationalization

Support:

English
Vietnamese

Implement:

- translation
- language switching
- date formatting
- number formatting
- currency formatting
- pluralization

Use locale-aware formatting rather than custom string formatting.

Prepare architecture for future RTL support but do not implement RTL unless useful.

## Design System

Audit reusable components.

Ensure components have consistent:

- spacing
- typography
- states
- colors/tokens
- focus
- disabled state
- error state
- loading state
- responsive behavior

Avoid duplicate UI patterns.

If two components are similar but semantically different, do not merge them merely to reduce file count.

## Component API Quality

Review Inputs/Outputs and public APIs.

Check:

- naming
- type safety
- defaults
- event semantics
- accessibility
- composability

Avoid excessive Inputs/Outputs.

## Testing

Add:

- accessibility tests
- keyboard interaction tests
- responsive tests where practical
- component behavior tests
- i18n tests

Run an accessibility audit.

Document remaining issues rather than hiding them.

## Deliverables

Update:

docs/accessibility.md
docs/i18n.md
docs/design-system.md

Report:

- accessibility findings
- fixes
- remaining issues
- responsive behavior
- i18n architecture

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
- [ ] axe runs on every route with zero critical or serious violations, or each exception is documented with a reason
- [ ] A full keyboard-only pass of every user journey succeeds, including dialogs, menus, tables and notifications
- [ ] English and Vietnamese both switch at runtime with no page reload
- [ ] No hardcoded user-facing strings remain anywhere
- [ ] Dates, numbers, currency and plurals use locale-aware formatting, not string concatenation
- [ ] The UTC / date-only time policy is verified — `dateOfBirth` does not shift across timezones
- [ ] Color contrast checked for both themes; reduced-motion preference honoured
- [ ] Remaining accessibility issues are documented rather than hidden
- [ ] Documentation updated; an ADR written for each significant decision
- [ ] `docs/PROGRESS.md` updated: built / decided / deviated / debt added / what the next phase needs to know
- [ ] Committed on branch `phase-6` and tagged
