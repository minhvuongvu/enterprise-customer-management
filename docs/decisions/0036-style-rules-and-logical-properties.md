# ADR-0036 — Style rules checked by a repository script; logical properties for RTL

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

Two rules existed only as review items: components use semantic tokens, never literal
colours or palette tokens (ADR-0010, debt row 10); and - new in Phase 6 - styles use
logical directions, so right-to-left support stays "one entry in `languages.ts`"
(§4.11: prepare for RTL, do not build it).

## Options considered

### A — stylelint

- Pros: the standard tool; rules for colour literals and physical properties exist.
- Cons: every component's styles are an inline template literal, which stylelint reads
  only through a custom-syntax plugin - two dependencies and a parser configuration to
  enforce four regular expressions.

### B — `lint/styles.ts`, a 150-line script run by `npm run lint` (chosen)

## Decision

`lint/styles.ts` extracts every `styles:` literal and every SCSS partial and fails on:
a literal colour or `--palette-*` outside `_tokens.scss`; a physical direction
(`margin-left`, `left:`, `text-align: right`, `border-right`, `float`); and
`outline: none`. An exception is a `style-lint-allow: <reason>` comment on the line
above; one without a reason is a violation. It found four real violations on its first
run, all fixed (one allowed, with its reason).

For RTL: `<html dir>` is written from the language definition, the stylesheets are
logical throughout, and CSS-drawn glyphs are the remaining work (a chevron that points
"next" must flip). No RTL language ships.

## Consequences

- A second design-system rule is one more entry in the array.
- The script is not stylelint, and says so in its header: if the rules outgrow regular
  expressions, that is the moment to adopt it.

## Revisit when

- A rule needs to understand selectors or values structurally (specificity, `var()`
  fallbacks) rather than match text.
