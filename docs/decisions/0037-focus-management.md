# ADR-0037 — Focus management: navigation, failed saves and re-rendered controls

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

The keyboard-only pass found three places where focus went somewhere unhelpful:

1. After a navigation, focus stayed on the link that was pressed - or, when that link
   was destroyed, fell to `<body>` - and a screen reader announced nothing.
2. After a failed save, focus stayed on the save button at the bottom of a long form,
   and the invalid field might be three screens up.
3. After changing page or sort, the results for the new criteria (not yet cached)
   showed a skeleton, which destroyed the pagination button or sort header that had
   focus. The next Tab started at the top of the document.

## Decision

1. **Navigation.** `AppShell` moves focus to the new page's `<h1>` (made focusable with
   `tabindex="-1"`, never a Tab stop) after the next render - except on the first
   navigation (a page load starts at the top anyway) and when only the query string or
   fragment changed: a filter, a sort or a page of results is not a new page, and
   stealing focus from a search box mid-word would be hostile. No `<h1>` means `<main>`.
2. **Failed save.** The form page focuses the first `[aria-invalid="true"]` field, after
   a client-side or a server-side (422, duplicate email) rejection. Arriving on it reads
   its label and, through `aria-describedby`, its error.
3. **Re-rendered controls.** The list page records the operated control as a selector
   for its counterpart in the next render (`app-pagination [aria-current="page"]`,
   the sorted header's button, the size or sort select), keyed to the criteria it
   asked for. When _those_ results are on screen, and only if focus was actually lost
   to `<body>`, focus goes there.

## Consequences

- Each is tested with the keyboard in `e2e/keyboard.spec.ts`, and the third was checked
  for teeth: without the restore, the pagination and sort tests fail.
- Phase 2's comment in the form page said focus should not move on a failed save; the
  keyboard pass disagreed, and the comment was replaced with the reason.

## Revisit when

- Angular ships a route-announcement or focus-on-navigate feature in the router.
- A page wants focus somewhere other than its heading after arrival (a search page
  focusing its search field); the rule then needs a per-route opt-out in route metadata.
