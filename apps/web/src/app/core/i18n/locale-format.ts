import { inject, Injectable } from '@angular/core';
import type { DateOnly, Instant } from '../time/instant';
import { formatDateOnly, instantToDate } from '../time/instant';
import { LanguageService } from './language.service';

/**
 * How an instant is written. Named by purpose rather than by pattern, so no
 * call site ever spells `dd/MM/yyyy` - a pattern is exactly the thing that
 * differs between locales.
 */
export type InstantStyle = 'short' | 'medium' | 'time' | 'timeWithSeconds';

const INSTANT_OPTIONS: Readonly<Record<InstantStyle, Intl.DateTimeFormatOptions>> = {
  short: { dateStyle: 'short', timeStyle: 'short' },
  medium: { dateStyle: 'medium', timeStyle: 'short' },
  time: { timeStyle: 'short' },
  timeWithSeconds: { timeStyle: 'medium' },
};

/**
 * Locale-aware formatting, in one place.
 *
 * Every date, number, amount and plural category on screen comes from `Intl`,
 * with the locale of the active language. Nothing here concatenates a number
 * with a separator or a currency symbol: `1.234.567 ₫` and `$1,234,567.00` are
 * not the same string with different punctuation, they are different rules
 * (grouping, decimal mark, symbol position, fraction digits), and `Intl`
 * already knows all of them.
 *
 * **Why not Angular's `DatePipe`.** It formats with `LOCALE_ID`, which is a
 * bootstrap-time constant: changing it means reloading the application, and
 * every extra locale has to be registered with `registerLocaleData` and
 * shipped in the bundle. Runtime switching is a requirement (§4.11), and the
 * browser's own `Intl` data costs nothing to download.
 *
 * Formatters are cached per locale and options: constructing an
 * `Intl.DateTimeFormat` is far more expensive than calling `format` on one,
 * and the pipes that use this run on every change detection of their view.
 *
 * Every method reads the language signal, so a `computed()` - or a template -
 * that calls one re-runs when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class LocaleFormat {
  private readonly language = inject(LanguageService);
  private readonly cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
  private readonly pluralRules = new Map<string, Intl.PluralRules>();

  /** The active locale. A signal read, so callers are tracked. */
  locale(): string {
    return this.language.locale();
  }

  /** A moment in time, in the viewer's time zone. */
  instant(value: Instant, style: InstantStyle = 'medium'): string {
    const locale = this.locale();
    return this.dateFormat(locale, style, INSTANT_OPTIONS[style]).format(instantToDate(value));
  }

  /** A calendar date, which must not move with the viewer's zone (rule 9). */
  dateOnly(value: DateOnly): string {
    return formatDateOnly(value, this.locale());
  }

  number(value: number, options: Intl.NumberFormatOptions = {}): string {
    return this.numberFormat(this.locale(), options).format(value);
  }

  /**
   * An amount of money.
   *
   * The currency is a property of the *amount*, never of the locale: a US
   * dollar price shown to a Vietnamese reader is still in dollars, and is
   * written `1.234,50 US$`. Choosing the currency from the language would
   * silently convert prices by relabelling them.
   */
  currency(amount: number, currency: string): string {
    return this.numberFormat(this.locale(), { style: 'currency', currency }).format(amount);
  }

  /**
   * Message parameters with every number formatted for the locale.
   *
   * For messages built far from where they are shown - a notification
   * recorded by a store, a confirmation asked by a page - whose parameters are
   * raw numbers. Strings pass through untouched; they are names and codes.
   */
  params(params: Readonly<Record<string, string | number>> | undefined): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(params ?? {})) {
      result[key] = typeof value === 'number' ? this.number(value) : value;
    }
    return result;
  }

  /**
   * The CLDR plural category for a count: `one` or `other` in English, always
   * `other` in Vietnamese, and up to six categories in languages such as
   * Arabic. Translation files are keyed by these categories (docs/i18n.md).
   */
  pluralCategory(count: number): Intl.LDMLPluralRule {
    const locale = this.locale();
    let rules = this.pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      this.pluralRules.set(locale, rules);
    }
    return rules.select(count);
  }

  private dateFormat(
    locale: string,
    style: string,
    options: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    const key = `date|${locale}|${style}`;
    let format = this.cache.get(key) as Intl.DateTimeFormat | undefined;
    if (!format) {
      format = new Intl.DateTimeFormat(locale, options);
      this.cache.set(key, format);
    }
    return format;
  }

  private numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = `number|${locale}|${JSON.stringify(options)}`;
    let format = this.cache.get(key) as Intl.NumberFormat | undefined;
    if (!format) {
      format = new Intl.NumberFormat(locale, options);
      this.cache.set(key, format);
    }
    return format;
  }
}
