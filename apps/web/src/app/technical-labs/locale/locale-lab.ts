import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { CurrencyPipe, NumberPipe, PluralPipe } from '../../core/i18n/locale-pipes';
import { formatDateOnly, type DateOnly, type Instant } from '../../core/time/instant';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Table } from '../../shared/ui/table/table';
import { LabSection } from '../lab-section';

/** Amounts shown in every currency, so the rules - not the numbers - differ. */
const SAMPLE_AMOUNT = 1234567.891;
const CURRENCIES = ['USD', 'VND', 'EUR', 'JPY'] as const;

/** Counts chosen to cross every plural boundary English and Vietnamese have. */
const SAMPLE_COUNTS = [0, 1, 2, 5, 21, 1000] as const;

/**
 * Time zones spanning the whole range of offsets. Kiritimati (UTC+14) and
 * Pago Pago (UTC−11) are more than a day apart: the same instant falls on
 * different calendar dates in them, which is exactly the situation that
 * breaks a date of birth stored as a moment.
 */
const TIME_ZONES = [
  'UTC',
  'Asia/Ho_Chi_Minh',
  'Europe/London',
  'America/Los_Angeles',
  'Pacific/Pago_Pago',
  'Pacific/Kiritimati',
] as const;

const SAMPLE_INSTANT = '2026-01-01T02:30:00.000Z' as Instant;
const SAMPLE_BIRTHDAY = '1990-01-01' as DateOnly;

interface ZoneRow {
  readonly zone: string;
  readonly instant: string;
  /** What `new Date('1990-01-01')` shows here - the bug, reproduced. */
  readonly naiveBirthday: string;
  /** What `formatDateOnly` shows here - the same date everywhere. */
  readonly birthday: string;
  readonly shifted: boolean;
}

/**
 * Locale formatting, side by side.
 *
 * The application formats every value through `LocaleFormat`; this page puts
 * the rules next to each other so the differences are visible at once, and it
 * follows the language switch in the header without a reload.
 *
 * The time-zone table is the one worth staring at. The left column is an
 * **instant** - a moment - and correctly reads differently in each zone. The
 * middle column is a date of birth parsed the naive way, as a moment at UTC
 * midnight, and it moves to 31 December west of Greenwich. The right column is
 * the same date handled as a `DateOnly` (rule 9, `core/time/instant.ts`): it
 * never moves.
 */
@Component({
  selector: 'app-locale-lab',
  imports: [
    CurrencyPipe,
    LabSection,
    NumberPipe,
    PageContainer,
    PageHeader,
    PluralPipe,
    Table,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t; prefix: 'pages.labs.locale'">
      <app-page-header [heading]="t('heading')" [description]="t('lede')" />

      <app-lab-section
        sectionId="numbers"
        [heading]="t('numbers.heading')"
        [description]="t('numbers.description', { locale: language.locale() })"
      >
        <dl class="facts">
          <div>
            <dt>{{ t('numbers.plain') }}</dt>
            <dd data-testid="locale-number">{{ amount | appNumber }}</dd>
          </div>
          @for (currency of currencies; track currency) {
            <div>
              <dt>{{ t('numbers.currency', { code: currency }) }}</dt>
              <dd [attr.data-testid]="'locale-currency-' + currency">
                {{ amount | appCurrency: currency }}
              </dd>
            </div>
          }
        </dl>
      </app-lab-section>

      <app-lab-section
        sectionId="plurals"
        [heading]="t('plurals.heading')"
        [description]="t('plurals.description')"
      >
        <ul class="plurals">
          @for (count of counts; track count) {
            <li [attr.data-testid]="'locale-plural-' + count">
              {{ 'pages.labs.locale.plurals.sample' | appPlural: count }}
            </li>
          }
        </ul>
      </app-lab-section>

      <app-lab-section
        sectionId="time-zones"
        [heading]="t('zones.heading')"
        [description]="t('zones.description')"
      >
        <app-table [caption]="t('zones.caption')">
          <table>
            <caption class="visually-hidden">
              {{
                t('zones.caption')
              }}
            </caption>
            <thead>
              <tr>
                <th scope="col">{{ t('zones.zone') }}</th>
                <th scope="col">{{ t('zones.instant') }}</th>
                <th scope="col">{{ t('zones.naive') }}</th>
                <th scope="col">{{ t('zones.dateOnly') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of zones(); track row.zone) {
                <tr [attr.data-testid]="'zone-' + row.zone">
                  <th scope="row">{{ row.zone }}</th>
                  <td>{{ row.instant }}</td>
                  <td [class.shifted]="row.shifted">
                    {{ row.naiveBirthday }}
                    @if (row.shifted) {
                      <span class="visually-hidden">{{ t('zones.shifted') }}</span>
                    }
                  </td>
                  <td data-testid="zone-birthday">{{ row.birthday }}</td>
                </tr>
              }
            </tbody>
          </table>
        </app-table>
      </app-lab-section>
    </app-page-container>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
      gap: var(--space-3);
      margin: 0;
    }

    .facts dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .facts dd {
      margin: 0;
      font-size: var(--text-lg);
      font-variant-numeric: tabular-nums;
    }

    .plurals {
      margin: 0;
      padding-inline-start: var(--space-5);
    }

    .shifted {
      color: var(--danger-text);
      font-weight: var(--weight-semibold);
    }
  `,
})
export class LocaleLab {
  protected readonly language = inject(LanguageService);

  protected readonly amount = SAMPLE_AMOUNT;
  protected readonly currencies = CURRENCIES;
  protected readonly counts = SAMPLE_COUNTS;

  /**
   * `Intl` directly, with an explicit `timeZone`, because the point of this
   * table is to show several zones at once. Everywhere else the viewer's own
   * zone is the only one that matters, and `LocaleFormat` uses it.
   */
  protected readonly zones = computed<readonly ZoneRow[]>(() => {
    const locale = this.language.locale();
    const expected = formatDateOnly(SAMPLE_BIRTHDAY, locale);
    return TIME_ZONES.map((zone) => {
      const naiveBirthday = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: zone,
      }).format(new Date(SAMPLE_BIRTHDAY));
      return {
        zone,
        instant: new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: zone,
        }).format(new Date(SAMPLE_INSTANT)),
        naiveBirthday,
        birthday: expected,
        shifted: naiveBirthday !== expected,
      };
    });
  });
}
