/**
 * The languages the application ships, and the three facts about each one
 * that are not translations.
 *
 * A *language* (`vi`) is what a translation file is keyed by. A *locale*
 * (`vi-VN`) is what `Intl` formats with: it also decides the digit grouping,
 * the date order and the first day of the week. They are kept apart on
 * purpose - one translation can serve several locales, and conflating the two
 * is how an application ends up formatting numbers "in English" for a British
 * user who wanted `1,234.5` and got `1,234.5` only by accident.
 *
 * `direction` is here for right-to-left languages. Both shipped languages are
 * left-to-right, so it is always `ltr` today; it exists so that adding Arabic
 * is one entry here plus a translation file, not a hunt through the layout.
 * The stylesheets already use logical properties (`margin-inline-start`, not
 * `margin-left`), which is the other half of that preparation - see
 * docs/i18n.md.
 */
export type TextDirection = 'ltr' | 'rtl';

export interface LanguageDefinition {
  /** Translation file key, and the value of `<html lang>`. */
  readonly code: string;
  /** BCP 47 locale handed to every `Intl` formatter. */
  readonly locale: string;
  readonly direction: TextDirection;
}

export const SUPPORTED_LANGUAGES: readonly LanguageDefinition[] = [
  { code: 'en', locale: 'en-US', direction: 'ltr' },
  { code: 'vi', locale: 'vi-VN', direction: 'ltr' },
];

export const FALLBACK_LANGUAGE = SUPPORTED_LANGUAGES[0];

/** The definition for a code, or `null` for one the application does not ship. */
export function findLanguage(code: string | null | undefined): LanguageDefinition | null {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code) ?? null;
}

/** Never fails: an unknown code formats as the fallback language would. */
export function languageDefinition(code: string): LanguageDefinition {
  return findLanguage(code) ?? FALLBACK_LANGUAGE;
}
