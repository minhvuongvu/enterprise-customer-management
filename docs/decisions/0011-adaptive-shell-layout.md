# ADR-0011 — The shell adapts at three widths, and only the drawer is code

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 1

## Problem

The application must work on desktop, tablet and mobile, and context 4.10 is
explicit that shrinking the desktop layout does not count. Navigation is the
part that actually has to change: a 240px sidebar beside a 390px viewport
leaves no room for content.

The question is what changes at each width, and — less obviously — **how much
of that is CSS and how much is TypeScript**. Getting the second part wrong
produces a layout that is correct only after hydration, or a component that
re-renders on every resize.

## Options considered

### How the navigation adapts

**A. One sidebar, narrower on small screens.** Simple, and the case 4.10 rules
out: at phone width there is no width left to narrow into.
**B. Sidebar on desktop, drawer below it.** Two shapes, one breakpoint.
**C. Sidebar, icon rail, drawer.** Three shapes. A tablet has room for icons
but not for labels, and losing navigation entirely at 900px is a regression a
tablet user notices.

### Where the decision is made

**A. All CSS.** Media queries decide everything. Correct before hydration, free
of change detection — but a media query cannot trap focus or close on Escape,
and a modal drawer needs both.
**B. All TypeScript.** A resize listener drives a mode signal and the template
branches on it. Consistent, and wrong on the first frame: server-rendered HTML
and the pre-hydration paint have no viewport to measure.
**C. CSS for presentation, TypeScript for behaviour.** Two mechanisms, with a
stated split.

## Decision

Option C in both dimensions: three layouts, with presentation in CSS and only
the drawer's _behaviour_ in code.

| Width         | Navigation                                                         |
| ------------- | ------------------------------------------------------------------ |
| ≥ 64rem       | permanent region beside the content                                |
| 48rem – 64rem | icon rail; labels kept for assistive technology, shown as tooltips |
| < 48rem       | modal drawer, opened from a header button                          |

`LayoutBreakpoints` exposes the active layout as a signal, fed by CDK's
`BreakpointObserver`. It exists for exactly one reason, stated in its own
documentation: a modal region has behaviour — focus trapping, Escape, closing
on navigation — and behaviour cannot live in a media query. Everything else
about the three layouts is CSS and therefore correct before any script runs.

`AppSidebar` renders the links and nothing else. `AppShell` decides whether
that appears as a region, a rail or a drawer. One navigation, three
presentations — rather than two lists that agree until someone edits one.

The breakpoint values exist twice, in `src/styles/_breakpoints.scss` and in
`layout-breakpoints.ts`. That duplication is deliberate — a build step to
generate one from the other is more machinery than two numbers justify — and
`layout-breakpoints.spec.ts` fails if they drift.

## Consequences

- The tablet rail hides labels with the visually-hidden technique rather than
  `display: none`, because an icon has no accessible name and the label is it.
- The drawer is a real `role="dialog"` with `aria-modal`, a CDK focus trap,
  Escape, and a close on every navigation — including the back button, which a
  link-click handler alone would miss.
- Closing on outside click is a `<button>` positioned behind the panel, not a
  click handler on a `<div>`: a div with a handler is invisible to keyboards
  and to assistive technology, and lint rejects it.
- Breakpoints are in `rem`, so a user who raises their base font size gets the
  next layout down — which is what they are asking for.
- `LayoutBreakpoints` reports `desktop` on the server, where no media query
  matches. The authenticated shell is client-rendered (ADR-0003), so this only
  affects what the very first frame assumes.
- The three layouts are verified at three viewport sizes in
  `e2e/layout.spec.ts`; the drawer's focus behaviour is verified there too,
  because jsdom reports every element as zero-sized and so decides nothing is
  focusable.

## Revisit when

- A layout needs a fourth shape — a wide screen with a persistent detail pane
  is the usual next one.
- Container queries are available everywhere the project targets: a card that
  reflows to its own container rather than to the viewport is a better fit for
  a component than a media query, and would move some of this out of the shell.
