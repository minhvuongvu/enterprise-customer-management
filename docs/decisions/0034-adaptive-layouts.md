# ADR-0034 — Adaptive layouts: swap components in TypeScript, restyle in CSS

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

§4.10: "do not merely shrink the desktop UI." At 375 px the customer list was a
seven-column table in a sideways scroll region, four page actions wrapped into a wall,
five filters filled the first screen, and the header held nine controls and scrolled the
whole page sideways.

ADR-0011 already chose CSS for presentation and TypeScript only for the drawer's
behaviour. Phase 6 needed a rule for the next case: when the phone should get a
_different component_, not a differently styled one.

## Options considered

### A — CSS only: render both, hide one per breakpoint

- Pros: works before hydration; no JavaScript decides layout.
- Cons: every row in the DOM twice, every checkbox in the tab order twice (hidden with
  `display: none` is fine for focus, but the duplicated state has to be kept in sync),
  twice the rendering cost on the one screen that can least afford it.

### B — A responsive table (rows restyled as cards with `display: block`)

- Cons: changing a table's `display` strips its table semantics in several browser and
  screen-reader combinations - the row and column relationships that are the reason it
  is a table.

### C — `LayoutBreakpoints.mode()` decides which component exists (chosen)

## Decision

Where the phone needs a different _structure_, the page reads `LayoutBreakpoints` and
renders one component or the other:

| Desktop / tablet                          | Phone                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| `app-customer-table`                      | `app-customer-card-list` - same inputs and outputs           |
| column-header sort buttons                | a labelled "Sort by" select (field × direction)              |
| four page-action buttons                  | the primary action + a "More actions" menu                   |
| five filter fields in a row               | search, plus a disclosure for the rest (`hidden`, not `@if`) |
| language, theme, user, sign-out in header | the same, in the navigation drawer's account section         |

Everything else stays CSS: grids that collapse to one column, dialogs that become
bottom sheets, buttons that go full width.

The card list is a `<ul>` of `<li>`, each value labelled with a `<dt>`, because a list
is what it is. It has `CustomerTable`'s exact contract, so the page's logic does not
know which is on screen.

## Consequences

- The client-rendered application picks its layout on the first frame; the server
  assumes desktop (ADR-0003 keeps authenticated pages off the server, so nothing
  prerendered flips).
- Component tests must say which layout they mean: jsdom has no media queries, so CDK
  reports the narrowest one. `provideLayoutMode()` in `layout/testing/` does that.
- A control that is swapped while focused loses focus. The list page puts it back
  (ADR-0037).

## Revisit when

- A page needs a structure that differs by _container_ width rather than viewport
  width - a list inside a side panel. Container queries, in CSS, are the tool then.
