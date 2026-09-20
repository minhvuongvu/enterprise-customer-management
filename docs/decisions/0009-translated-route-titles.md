# ADR-0009 — Route titles are translation keys

**Status:** Accepted
**Date:** 2026-09-20
**Phase:** Phase 1

Answers open question 4 in `docs/PROGRESS.md`.

## Problem

Every route needs a document title. Angular's router takes one as `title` on a
route and writes it into `document.title` verbatim.

That collides head-on with rule 1: a route file containing `title: 'Customers'`
is a hardcoded user-facing string. It is also the kind that survives review,
because a route file does not look like a place where copy lives — and it is
read out by screen readers, shown in the tab, and used as the bookmark name.

Phase 0 saw this and deferred it, on the grounds that a title strategy belongs
with the shell. The shell is Phase 1.

## Options considered

### Option A — each page sets its own title

Every routed component injects `Title` and sets it in a constructor.

- Pros: no router machinery; the title sits next to the page it describes.
- Cons: it is a side effect in a constructor, on every page, forever. It runs
  after the route has changed, so there is a frame where the tab shows the
  previous page. A page that forgets is silently wrong. Twenty pages is twenty
  chances to forget, and nothing fails when one does.

### Option B — a resolver per route

`title: () => inject(TranslocoService).translate('...')`.

- Pros: stays in the route file; typed.
- Cons: `translate()` is synchronous and returns the key when the language
  chunk has not loaded yet, which is exactly the state a first navigation is
  in. It also does not re-run when the language changes, so Phase 6 would find
  every tab stuck in English.

### Option C — a `TitleStrategy` that treats `route.title` as a key

One class, provided once; route files keep declaring `title`, but the value is
a key.

- Pros: routes stay declarative and typo-checkable against `en.json`; one place
  resolves and formats; the "· Customer Management" suffix is applied once
  rather than repeated in thirty strings.
- Cons: a reader has to know that `title` is not a title. That is a comment,
  and one indirection.

## Decision

Option C. `TranslatedTitleStrategy` resolves `route.title` through Transloco
and appends the application name.

Two details are load-bearing rather than incidental:

- the title is applied through `selectTranslate`, which emits again when the
  chunk finishes loading — so a navigation that beats the translation file does
  not leave the key in the tab;
- it re-applies on language change, which is what keeps the tab correct after
  Phase 6 adds a second language.

The related `<html lang>` synchronisation (`provideDocumentLanguage`) is the
same decision applied to the other piece of per-document metadata that scope
note 7.1 keeps in scope.

## Consequences

- Route files contain keys. `title: 'pages.customers.list.title'` is a
  deliberate shape, and `app.routes.spec.ts` asserts every reachable route has
  one that _looks_ like a key.
- Adding a page means adding a key to `en.json`. Forgetting shows up as a
  missing-key warning in development, not as an empty tab.
- The document title and the page's `<h1>` are two strings that must agree.
  They are separate keys today; if they drift often enough to matter, deriving
  one from the other is the next step.
- Reversing this is deleting one provider and renaming the route values.

## Revisit when

- A route needs a title containing data — "Ada Lovelace · Customers" — which
  requires a resolver feeding the strategy rather than a static key.
- Phase 7 adds per-route `robots` or Open Graph metadata; that is the same seam
  and should join this class rather than start a second one.
