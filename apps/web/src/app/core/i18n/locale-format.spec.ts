import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import type { DateOnly, Instant } from '../time/instant';
import { provideTestTranslations } from '../testing/i18n-testing';
import { LocaleFormat } from './locale-format';
import { LOCALE_PIPES } from './locale-pipes';

/**
 * Formatting follows the active language, at runtime.
 *
 * The assertions compare against `Intl` output rather than hand-written
 * strings wherever the exact spacing is ICU data (Vietnamese currency uses a
 * narrow no-break space, which a literal in a test would get wrong in a way
 * nobody can see). Where the difference *is* the point - grouping, decimal
 * mark, plural choice - the expected text is written out.
 */
@Component({
  selector: 'app-locale-host',
  imports: [LOCALE_PIPES],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p id="number">{{ amount() | appNumber }}</p>
    <p id="currency">{{ amount() | appCurrency: 'USD' }}</p>
    <p id="birthday">{{ birthday | appDateOnly }}</p>
    <p id="plural">{{ 'pages.customers.import.confirm' | appPlural: count() }}</p>
  `,
})
class LocaleHost {
  readonly amount = signal(1234567.5);
  readonly count = signal(1);
  readonly birthday = '1990-01-01' as DateOnly;
}

describe('LocaleFormat', () => {
  let format: LocaleFormat;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [provideTestTranslations()] });
    format = TestBed.inject(LocaleFormat);
    transloco = TestBed.inject(TranslocoService);
  });

  it('groups and separates numbers the way the active language does', () => {
    expect(format.number(1234567.5)).toBe('1,234,567.5');

    transloco.setActiveLang('vi');

    expect(format.number(1234567.5)).toBe('1.234.567,5');
  });

  it('takes the currency from the amount, never from the language', () => {
    const inEnglish = format.currency(1234.5, 'USD');
    transloco.setActiveLang('vi');
    const inVietnamese = format.currency(1234.5, 'USD');

    expect(inEnglish).toBe('$1,234.50');
    // Still dollars: relabelling a price by the reader's language would
    // silently change what it means.
    expect(inVietnamese).toBe(
      new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'USD' }).format(1234.5),
    );
    expect(inVietnamese).toContain('1.234,50');
  });

  it('knows that the dong has no minor unit', () => {
    transloco.setActiveLang('vi');

    expect(format.currency(125000, 'VND')).toBe(
      new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(125000),
    );
    expect(format.currency(125000, 'VND')).not.toContain(',');
  });

  it('chooses plural categories per language', () => {
    expect(format.pluralCategory(1)).toBe('one');
    expect(format.pluralCategory(2)).toBe('other');

    transloco.setActiveLang('vi');

    // Vietnamese does not inflect for number.
    expect(format.pluralCategory(1)).toBe('other');
  });

  it('formats an instant in the viewer zone, in the active language', () => {
    const at = '2026-03-04T05:06:07.000Z' as Instant;
    const expected = (locale: string) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(at),
      );

    expect(format.instant(at, 'medium')).toBe(expected('en-US'));
    transloco.setActiveLang('vi');
    expect(format.instant(at, 'medium')).toBe(expected('vi-VN'));
  });

  it('formats every number in a set of message parameters, and leaves text alone', () => {
    transloco.setActiveLang('vi');

    expect(format.params({ count: 12000, code: 'C-000123' })).toEqual({
      count: '12.000',
      code: 'C-000123',
    });
  });
});

describe('locale pipes', () => {
  async function render() {
    await TestBed.configureTestingModule({
      imports: [LocaleHost, provideTestTranslations()],
    }).compileComponents();
    const fixture = TestBed.createComponent(LocaleHost);
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: { nativeElement: unknown }, id: string): string {
    return (fixture.nativeElement as HTMLElement).querySelector(`#${id}`)?.textContent ?? '';
  }

  it('re-render when the language changes, without a reload', async () => {
    const fixture = await render();
    expect(text(fixture, 'number')).toBe('1,234,567.5');
    expect(text(fixture, 'birthday')).toBe('January 1, 1990');

    TestBed.inject(TranslocoService).setActiveLang('vi');
    fixture.detectChanges();

    expect(text(fixture, 'number')).toBe('1.234.567,5');
    expect(text(fixture, 'birthday')).toBe(
      new Intl.DateTimeFormat('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(1990, 0, 1))),
    );
  });

  it('pick the plural form for the count, and format the count', async () => {
    const fixture = await render();
    expect(text(fixture, 'plural')).toBe('Import 1 customer');

    fixture.componentInstance.count.set(1200);
    fixture.detectChanges();
    expect(text(fixture, 'plural')).toBe('Import 1,200 customers');

    TestBed.inject(TranslocoService).setActiveLang('vi');
    fixture.detectChanges();
    expect(text(fixture, 'plural')).toBe('Nhập 1.200 khách hàng');
  });
});
