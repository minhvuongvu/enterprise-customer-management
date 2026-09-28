# ADR-0033 — Plurals as CLDR-category keys, chosen by `Intl.PluralRules`

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

"1 were changed by someone else", "Clicked 1 times", "1 rows skipped" - English copy
written with `{{count}}` and no plural forms. Vietnamese does not inflect for number;
English has two forms; languages this application may add later have up to six.

## Options considered

### A — ICU MessageFormat (`@jsverse/transloco-messageformat`)

`"{count, plural, one {# customer} other {# customers}}"` inside the string.

- Pros: the industry format; several plurals and selects in one sentence; translators
  and tools know it.
- Cons: a message-format runtime in the bundle (the budget is a ratchet, ADR-0025);
  every translation becomes a small program a translator can break with one brace; a
  second syntax next to Transloco's `{{ }}`.

### B — `count === 1 ? a : b` in templates

- Cons: English-only by construction. Wrong for every language with other rules.

### C — One key per CLDR category, selected by `Intl.PluralRules` (chosen)

```json
"confirm": { "one": "Import {{count}} customer", "other": "Import {{count}} customers" }
"confirm": { "other": "Nhập {{count}} khách hàng" }
```

- Pros: no dependency - `Intl.PluralRules` knows every locale's rules; each form is a
  plain string a translator reads as a sentence; the categories a language may use are
  checkable (a test rejects `one` in Vietnamese, which the rules never select).
- Cons: one count per string. A sentence with two independent counts is two strings.

## Decision

Option C. `appPlural` (and `translatePlural` for TypeScript callers) picks
`<key>.<category>`, falls back to `other`, and passes `count` already formatted for the
locale. `translations.spec.ts` enforces: same keys in both files, same parameters per
key, plural in both or neither, `other` present, only categories the language has.

## Consequences

- "2 customers imported, 1 rows skipped" became two sentences, each agreeing with its
  own number. That is the stated cost, and it produced better copy.
- A key's shape tells whether it is plural: an object of categories that includes
  `other`. `crossTab.customers.many` - an ordinary key that happens to be called "many"
  - is why the `other` requirement is part of the definition.

## Revisit when

- A translation genuinely needs two counts, or a gender select, in one sentence. That
  is the point at which ICU pays for itself.
