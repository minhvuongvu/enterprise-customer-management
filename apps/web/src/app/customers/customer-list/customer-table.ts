import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { parseSortParam, type Customer, type CustomerId } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { Badge } from '../../shared/ui/badge/badge';
import { Table } from '../../shared/ui/table/table';
import { genderLabelKey, statusLabelKey, statusTone } from '../customer-vocabulary';

/** A column that can be ordered by, paired with the API's sort field name. */
interface SortableColumn {
  readonly field: string;
  readonly labelKey: string;
}

/**
 * The columns offered for sorting, in the order they appear.
 *
 * The field names are the contract's `customerSortFieldSchema` members. A
 * column the API cannot sort by must not render a sort control: an ordering
 * request that silently does nothing is worse than no control at all.
 */
const SORTABLE_COLUMNS: readonly SortableColumn[] = [
  { field: 'customerCode', labelKey: 'customers.field.customerCode' },
  { field: 'fullName', labelKey: 'customers.field.fullName' },
  { field: 'email', labelKey: 'customers.field.email' },
  { field: 'status', labelKey: 'customers.field.status' },
  { field: 'updatedAt', labelKey: 'customers.field.updatedAt' },
];

/**
 * The customer table.
 *
 * It renders a real `<table>` inside `app-table`'s scroll region, because a
 * table of records is a table: the row and column relationships are what a
 * screen reader uses to say "Email, an@example.test" instead of reading a
 * grid of unlabelled cells.
 *
 * Three accessibility details are load-bearing rather than decorative:
 *
 *  - each sortable header is a `<button>` inside the `<th>`, and the `<th>`
 *    carries `aria-sort`. That is the documented pattern: the header conveys
 *    the state, the button is the control.
 *  - every checkbox has its own accessible name built from the customer's
 *    name. Twenty checkboxes all called "Select" tell a screen-reader user
 *    nothing about what they are selecting.
 *  - the name cell is a link to the record. Navigation is a link, so middle
 *    click and "open in a new tab" work; a row-level click handler would take
 *    both away.
 *
 * It owns no state. Rows, sort and selection come in; intentions go out. The
 * page decides what a sort change means - here, a URL change.
 */
@Component({
  selector: 'app-customer-table',
  imports: [Badge, DatePipe, RouterLink, Table, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-table [caption]="t('pages.customers.list.table.caption')" *transloco="let t">
      <table>
        <caption class="visually-hidden">
          {{
            t('pages.customers.list.table.caption')
          }}
        </caption>
        <thead>
          <tr>
            @if (selectable()) {
              <th scope="col" class="cell--select">
                <input
                  type="checkbox"
                  [attr.aria-label]="t('pages.customers.list.table.selectAll')"
                  [checked]="allSelected()"
                  [indeterminate]="someSelected()"
                  (change)="allToggled.emit(!allSelected())"
                  data-testid="select-all"
                />
              </th>
            }

            @for (column of columns; track column.field) {
              <th scope="col" [attr.aria-sort]="ariaSort(column.field)">
                <button type="button" class="sort" (click)="toggleSort(column.field)">
                  {{ t(column.labelKey) }}
                  <span
                    class="sort__marker"
                    aria-hidden="true"
                    [attr.data-direction]="markerFor(column.field)"
                  ></span>
                </button>
              </th>
            }

            <th scope="col">{{ t('customers.field.gender') }}</th>
          </tr>
        </thead>

        <tbody>
          @for (row of rows(); track row.id) {
            <tr [class.row--selected]="isSelected(row.id)">
              @if (selectable()) {
                <td class="cell--select">
                  <input
                    type="checkbox"
                    [attr.aria-label]="
                      t('pages.customers.list.table.selectRow', { name: row.fullName })
                    "
                    [checked]="isSelected(row.id)"
                    (change)="rowToggled.emit(row.id)"
                  />
                </td>
              }
              <td class="cell--code">{{ row.customerCode }}</td>
              <td>
                <a [routerLink]="['/customers', row.id]">{{ row.fullName }}</a>
              </td>
              <td class="cell--email">{{ row.email }}</td>
              <td>
                <app-badge [tone]="tone(row)">{{ t(statusKey(row)) }}</app-badge>
              </td>
              <td>
                <!-- An Instant is UTC on the wire and local only here, which is
                     the whole point of keeping the two apart. -->
                <time [attr.datetime]="row.updatedAt">{{ row.updatedAt | date: 'short' }}</time>
              </td>
              <td>{{ t(genderKey(row)) }}</td>
            </tr>
          }
        </tbody>
      </table>
    </app-table>
  `,
  styles: `
    .cell--select {
      width: 1%;
      white-space: nowrap;
    }

    .cell--code {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .cell--email {
      color: var(--text-secondary);
    }

    .sort {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      padding: 0;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .sort:hover {
      color: var(--text-primary);
    }

    /* Drawn from CSS rather than written in the template: a glyph in the
       markup is a text node, and every text node here is a translation. */
    .sort__marker[data-direction='asc']::before {
      content: '\\25B4';
    }
    .sort__marker[data-direction='desc']::before {
      content: '\\25BE';
    }

    .row--selected {
      background-color: var(--accent-subtle);
    }

    tbody a {
      color: var(--accent-text);
      font-weight: var(--weight-medium);
    }
  `,
})
export class CustomerTable {
  readonly rows = input.required<readonly Customer[]>();
  /** `field,direction`, as it appears in the URL. */
  readonly sort = input.required<string>();
  readonly selectedIds = input.required<ReadonlySet<CustomerId>>();
  /**
   * False removes the selection column. The page decides, from the user's
   * permissions: selecting rows is only useful to someone who can act on them.
   */
  readonly selectable = input(true);

  readonly sortChange = output<string>();
  readonly rowToggled = output<CustomerId>();
  /** True to select every row on this page, false to clear them. */
  readonly allToggled = output<boolean>();

  protected readonly columns = SORTABLE_COLUMNS;

  private readonly parsedSort = computed(() => parseSortParam(this.sort()));

  protected readonly allSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });

  /** Some but not all - the checkbox's third, indeterminate state. */
  protected readonly someSelected = computed(() => {
    const selected = this.selectedIds();
    const rows = this.rows();
    const count = rows.filter((row) => selected.has(row.id)).length;
    return count > 0 && count < rows.length;
  });

  protected isSelected(id: CustomerId): boolean {
    return this.selectedIds().has(id);
  }

  protected tone(row: Customer) {
    return statusTone(row.status);
  }

  protected statusKey(row: Customer): string {
    return statusLabelKey(row.status);
  }

  protected genderKey(row: Customer): string {
    return genderLabelKey(row.gender);
  }

  /** `ascending` / `descending` / `none`, as the ARIA specification spells them. */
  protected ariaSort(field: string): 'ascending' | 'descending' | 'none' {
    const { field: active, direction } = this.parsedSort();
    if (active !== field) {
      return 'none';
    }
    return direction === 'asc' ? 'ascending' : 'descending';
  }

  protected markerFor(field: string): string | null {
    const { field: active, direction } = this.parsedSort();
    return active === field ? direction : null;
  }

  /**
   * Clicking the active column reverses it; clicking another switches to it.
   *
   * A new column starts ascending, except for the two timestamps, where "most
   * recent first" is what someone asking to sort by date almost always means.
   */
  protected toggleSort(field: string): void {
    const { field: active, direction } = this.parsedSort();
    if (active === field) {
      this.sortChange.emit(`${field},${direction === 'asc' ? 'desc' : 'asc'}`);
      return;
    }
    const isTimestamp = field === 'createdAt' || field === 'updatedAt';
    this.sortChange.emit(`${field},${isTimestamp ? 'desc' : 'asc'}`);
  }
}
