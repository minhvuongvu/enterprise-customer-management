import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { SpecimenRow } from './rendering-specimens';

/**
 * The heavy part of the specimen page: a table with a button per row.
 *
 * The buttons are the point. Hydration's work is attaching the application to
 * DOM it did not create - finding each node and wiring each listener - so a
 * table of plain text would make every mode look alike. Four hundred rows
 * with a listener each is roughly one screen of a real back-office table.
 */
@Component({
  selector: 'app-specimen-catalogue',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="catalogue" *transloco="let t; prefix: 'pages.labs.rendering.specimen'">
      <caption>
        {{
          t('catalogueCaption', { count: rows().length })
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t('code') }}</th>
          <th scope="col">{{ t('category') }}</th>
          <th scope="col">{{ t('quantity') }}</th>
          <th scope="col">{{ t('amount') }}</th>
          <th scope="col">{{ t('details') }}</th>
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track row.code) {
          <tr>
            <td>{{ row.code }}</td>
            <td>{{ t('categories.' + row.category) }}</td>
            <td>{{ row.quantity }}</td>
            <td>{{ row.amountCents / 100 }}</td>
            <td>
              <button type="button" class="catalogue__toggle" (click)="toggle(row.code)">
                {{ expanded() === row.code ? t('hide') : t('show') }}
              </button>
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    .catalogue {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-sm);
    }

    caption {
      padding-block: var(--space-2);
      text-align: start;
      color: var(--text-secondary);
    }

    th,
    td {
      padding: var(--space-1) var(--space-2);
      border-block-end: var(--border-width) solid var(--border-subtle);
      text-align: start;
    }

    .catalogue__toggle {
      padding: 0 var(--space-2);
      border: var(--border-width) solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      color: var(--text-primary);
      cursor: pointer;
    }
  `,
})
export class SpecimenCatalogue {
  readonly rows = input.required<readonly SpecimenRow[]>();

  protected readonly expanded = signal<string | null>(null);

  protected toggle(code: string): void {
    this.expanded.update((current) => (current === code ? null : code));
  }
}
