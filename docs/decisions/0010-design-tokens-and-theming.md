# ADR-0010 — Design tokens as CSS custom properties, themed by one attribute

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 1

## Problem

The application needs a light theme, a dark theme, and the ability to switch
between them at runtime — plus a spacing, typography and radius system that
components can share without copying numbers.

The decision is not "use variables". It is _where the values live_ and _what a
component is allowed to reference_, because that is what determines whether
adding a theme later is a stylesheet or a repository-wide edit.

## Options considered

### Option A — SCSS variables

- Pros: familiar; compile-time checked; no runtime cost.
- Cons: resolved at build time. A second theme means a second compiled
  stylesheet and a page reload to switch, or every themed value duplicated
  under a class. Neither is runtime switching.

### Option B — a CSS-in-JS or utility framework

- Pros: theming is a solved feature of the library.
- Cons: a dependency that owns how every component is styled, in a repository
  whose point is that the reader can see how things work. Context 5.8 rules out
  component libraries for the same reason.

### Option C — CSS custom properties, one layer

Every token is semantic: `--button-background`, `--card-border`, and so on.

- Pros: simple; one lookup.
- Cons: the list grows per component rather than per concept, and two
  components that should look the same drift because nothing says they share a
  value.

### Option D — CSS custom properties in two layers

A primitive layer (the palette and the scales) and a semantic layer
(`--surface-raised`, `--text-muted`, `--accent`). Components may reference only
the semantic layer; only the semantic layer is redefined per theme.

- Pros: a theme is a short list of redefinitions rather than a second
  stylesheet; a component written against meaning is automatically correct in
  both themes; the palette can be retuned without touching a component.
- Cons: two lookups to find a colour, and a rule that only review enforces.

## Decision

Option D, with the theme applied as `data-theme` on `<html>`:

- `:root` defines the primitives, the scales and the light semantic layer;
- `:root[data-theme='dark']` redefines only the semantic layer;
- `@media (prefers-color-scheme: dark) :root:not([data-theme='light'])` applies
  the same redefinitions when the user has expressed no preference.

`ThemeService` writes the attribute for an explicit choice and **removes** it
for "follow the system". Removal rather than writing a resolved value is the
part worth noticing: it hands the decision back to the media query, which is
also what paints the server-rendered HTML and the first frame before any script
has run. A service that wrote `data-theme="light"` on boot would produce a
flash on a machine set to dark.

Contrast is part of the token definition, not a later audit. Several tokens are
a step darker or lighter than the palette entry they are named after precisely
because they failed 4.5:1 against the surface they are used on; the axe scans in
`e2e/layout.spec.ts` run in both themes to keep it that way.

## Consequences

- A component that writes `#1f2937`, or reaches for `--palette-blue-600`, has
  opted out of theming without saying so. Both are review items today: the
  grep for hex literals in `apps/web/src/app` is clean, and a stylelint rule in
  Phase 6 would make it mechanical.
- Switching themes re-renders nothing. The browser recomputes custom properties
  and repaints, which is why the switch is instant and why no component
  subscribes to the theme.
- Adding a third theme (high contrast) is one more block of semantic
  redefinitions.
- The primitive ramp is long on neutrals, because an enterprise UI is mostly
  greys and the difference between a divider and a border is one step.
- Reversing this means rewriting every component's styles. It is the most
  expensive decision in Phase 1 to undo, which is why it is an ADR.

## Revisit when

- A design system with real brand tokens arrives and wants to own the palette.
- Per-tenant theming appears: the semantic layer is the seam for it, but the
  values would then have to come from runtime configuration rather than from a
  stylesheet.
