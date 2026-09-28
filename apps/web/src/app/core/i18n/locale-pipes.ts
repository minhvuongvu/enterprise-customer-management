import { inject, Pipe, PipeTransform } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { DateOnly, Instant } from '../time/instant';
import { LanguageService } from './language.service';
import { LocaleFormat, type InstantStyle } from './locale-format';

/*
 * Template access to `LocaleFormat`.
 *
 * All five are `pure: false`, and that is a decision rather than an
 * oversight. A pure pipe is memoised on its arguments; the language is not an
 * argument, so a pure `{{ at | appInstant }}` would keep the old language's
 * output after a switch. Impure pipes run on every change detection of their
 * view - cheap here, because the formatters are cached, the views are OnPush
 * and the application is zoneless, so "every change detection" is rare.
 *
 * The alternative - passing the locale into every pipe call - is correct too,
 * and moves the burden onto a hundred call sites that each have to remember.
 */

/** `{{ customer.updatedAt | appInstant: 'short' }}` - a moment, in the viewer's zone. */
@Pipe({ name: 'appInstant', pure: false })
export class InstantPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);

  transform(value: Instant | null | undefined, style: InstantStyle = 'medium'): string {
    return value ? this.format.instant(value, style) : '';
  }
}

/** `{{ customer.dateOfBirth | appDateOnly }}` - a calendar date that never shifts. */
@Pipe({ name: 'appDateOnly', pure: false })
export class DateOnlyPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);

  transform(value: DateOnly | null | undefined): string {
    return value ? this.format.dateOnly(value) : '';
  }
}

/** `{{ total | appNumber }}` - grouping and decimal mark of the active locale. */
@Pipe({ name: 'appNumber', pure: false })
export class NumberPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);

  transform(value: number | null | undefined, maximumFractionDigits?: number): string {
    if (value === null || value === undefined) {
      return '';
    }
    return this.format.number(
      value,
      maximumFractionDigits === undefined ? {} : { maximumFractionDigits },
    );
  }
}

/** `{{ amount | appCurrency: 'USD' }}` - the currency comes with the amount. */
@Pipe({ name: 'appCurrency', pure: false })
export class CurrencyPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);

  transform(value: number | null | undefined, currency: string): string {
    return value === null || value === undefined ? '' : this.format.currency(value, currency);
  }
}

/**
 * `{{ 'pages.customers.list.table.selected' | appPlural: count }}`
 *
 * Picks the translation for the count's plural category - `…selected.one`,
 * `…selected.other` - and passes `count` into it already formatted for the
 * locale, so "1,204 selected" and "1.204 mục đã chọn" both come out right.
 * Extra parameters are merged in.
 *
 * A category missing from a translation falls back to `other`, which every
 * plural entry must have (the key-parity test enforces it).
 */
@Pipe({ name: 'appPlural', pure: false })
export class PluralPipe implements PipeTransform {
  private readonly format = inject(LocaleFormat);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  transform(key: string, count: number, params: Readonly<Record<string, unknown>> = {}): string {
    return translatePlural(this.transloco, this.format, this.language.active(), key, count, params);
  }
}

/**
 * The plural lookup, for TypeScript callers (a notification message, an
 * accessible name built in a `computed`).
 */
export function translatePlural(
  transloco: TranslocoService,
  format: LocaleFormat,
  lang: string,
  key: string,
  count: number,
  params: Readonly<Record<string, unknown>> = {},
): string {
  const values = { ...params, count: format.number(count) };
  const categoryKey = `${key}.${format.pluralCategory(count)}`;
  const translated = transloco.translate(categoryKey, values, lang);
  // Transloco answers a missing key with the key itself.
  return translated === categoryKey
    ? transloco.translate(`${key}.other`, values, lang)
    : translated;
}

/** The five pipes, for a component's `imports`. */
export const LOCALE_PIPES = [
  InstantPipe,
  DateOnlyPipe,
  NumberPipe,
  CurrencyPipe,
  PluralPipe,
] as const;
