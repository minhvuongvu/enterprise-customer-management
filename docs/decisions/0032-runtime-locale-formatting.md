# ADR-0032 — Locale formatting through `Intl`, keyed to the active language

**Status:** Accepted
**Date:** 2026-09-28
**Phase:** Phase 6

## Problem

Phase 6 adds Vietnamese, and §4.11 requires dates, numbers, currency and plurals
formatted for the reader's locale - switched at runtime, with no reload. Until now every
date went through Angular's `DatePipe`, and numbers were interpolated raw: `50000
customers`, `1270607 primes`.

`DatePipe` formats with `LOCALE_ID`. That token is read once, at bootstrap; changing it
means reloading the application, and every locale beyond `en-US` has to be registered
with `registerLocaleData` and shipped in the bundle.

## Options considered

### A — `LOCALE_ID` + `registerLocaleData('vi')`, reload on switch

- Pros: Angular's own pipes; no new code.
- Cons: a reload on every language switch, which §3.11 rules out (it is why ADR-0001
  rejected `@angular/localize`); Vietnamese locale data in every user's bundle.

### B — `@jsverse/transloco-locale`

- Pros: Transloco's plugin; locale-aware pipes that follow the active language.
- Cons: a dependency for what is, underneath, a cached `Intl` call; its own
  configuration object mapping languages to locales, which this repository already
  needs for `<html dir>`; not in the locked stack.

### C — A small `LocaleFormat` service over `Intl`, with impure pipes (chosen)

- Pros: the browser's (and Node's) `Intl` data costs nothing to download; one place
  maps a language to a locale and a direction (`core/i18n/languages.ts`); the pipes
  read a signal, so a switch re-renders what shows a formatted value and nothing else.
- Cons: about 200 lines to own; impure pipes run on every change detection of their
  view.

## Decision

- `LanguageService` (`core/i18n/`) owns the active language as a signal, its locale
  (`en-US`, `vi-VN`) and direction, the switch (chunk loaded _before_ activation, so no
  raw keys flash), persistence in `localStorage`, and following other tabs through the
  `storage` event. The starting language is the stored choice, else the deployment's
  `defaultLanguage`, chosen after runtime configuration has loaded. Prerendered HTML is
  always the default language.
- `LocaleFormat` wraps `Intl.DateTimeFormat`, `NumberFormat` and `PluralRules`, caching
  one formatter per locale and options. Instants use named styles (`short`, `medium`,
  `time`), never patterns. `DateOnly` goes through `formatDateOnly` (rule 9).
- Five pipes - `appInstant`, `appDateOnly`, `appNumber`, `appCurrency`, `appPlural` -
  `pure: false`, because the language is not an argument and a pure pipe memoised on its
  arguments would keep the old language. They are cheap: cached formatters, OnPush
  views, a zoneless application.
- **The currency comes with the amount, never from the language.** A dollar price shown
  to a Vietnamese reader is `1.234,50 US$`.
- `DatePipe` is no longer used anywhere; removing it (and Angular's `en-US` locale data)
  took the initial bundle from 524.6 to 515.4 kB.

## Consequences

- Message parameters recorded far from where they are shown (a notification, a
  confirmation) are raw numbers; the host formats them with `LocaleFormat.params`.
- Native `<input type="date">` shows the _browser's_ date format, not the page's
  language. There is no API to change that; see docs/i18n.md.
- The locale for English is `en-US`. A British deployment wants `en-GB`: that is one
  entry in `languages.ts`, or a future runtime-config field.

## Revisit when

- A language needs a locale the runtime's `Intl` data does not have (small-ICU Node
  builds) - the server would then format differently from the browser.
- Formatting shows up in a profile. It has not: the formatters are cached.
