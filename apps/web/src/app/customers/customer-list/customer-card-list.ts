import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { parseSortParam, type Customer, type CustomerId } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { InstantPipe } from '../../core/i18n/locale-pipes';
import { Badge } from '../../shared/ui/badge/badge';
import { Select, type SelectOption } from '../../shared/ui/select/select';
import { genderLabelKey, statusLabelKey, statusTone } from '../customer-vocabulary';
import { SORTABLE_COLUMNS } from './customer-table';

/** Translate function handed down by `*transloco`. */
type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The customer list on a phone.
 *
 * A seven-column table on a 375-pixel screen is not responsive, it is a
 * horizontal scrollbar - and the column a user needs (status, say) is the one
 * scrolled out of sight, with its header scrolled away from it. So the mobile
 * layout changes *shape* rather than size (context §4.10): one card per
 * customer, in a list, with every value labelled in place.
 *
 * It is the same component contract as `CustomerTable` - the same rows, sort
 * and selection in, the same three intentions out - so the page swaps one
 * for the other without changing anything it does. Two things a table gets
 * from its header row have to be supplied here instead:
 *
 *  - **sorting** is a select of "field, direction" pairs, because there are
 *    no column headers to press;
 *  - **select all** is its own labelled checkbox above the list.
 *
 * It is a `<ul>` of `<li>`, not `role="grid"` or a table styled as cards.
 * A list is what this is, and a screen reader announces "list, 20 items" and
 * lets the user move item by item - which is exactly how a card list is read.
 */
@Component({
  selector: 'app-customer-card-list',
  imports: [Badge, InstantPipe, ReactiveFormsModule, RouterLink, Select, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cards" *transloco="let t">
      <div class="cards__toolbar">
        @if (selectable()) {
          <label class="cards__check">
            <input
              type="checkbox"
              [checked]="allSelected()"
              [indeterminate]="someSelected()"
              (change)="allToggled.emit(!allSelected())"
              data-testid="select-all"
            />
            {{ t('pages.customers.list.table.selectAll') }}
          </label>
        }

        <div class="cards__sort">
          <app-select
            name="sort"
            data-testid="card-sort"
            [formControl]="sortControl"
            [label]="t('pages.customers.list.cards.sortBy')"
            [options]="sortOptions(t)"
          />
        </div>
      </div>

      <ul class="cards__list" [attr.aria-label]="t('pages.customers.list.table.caption')">
        @for (row of rows(); track row.id) {
          <li class="card" [class.card--selected]="isSelected(row.id)" data-testid="customer-card">
            <div class="card__top">
              @if (selectable()) {
                <input
                  type="checkbox"
                  class="card__select"
                  [attr.aria-label]="
                    t('pages.customers.list.table.selectRow', { name: row.fullName })
                  "
                  [checked]="isSelected(row.id)"
                  (change)="rowToggled.emit(row.id)"
                />
              }
              <a class="card__name" [routerLink]="['/customers', row.id]">{{ row.fullName }}</a>
              <app-badge [tone]="tone(row)">{{ t(statusKey(row)) }}</app-badge>
            </div>

            <dl class="card__facts">
              <div>
                <dt>{{ t('customers.field.customerCode') }}</dt>
                <dd class="card__code">{{ row.customerCode }}</dd>
              </div>
              <div>
                <dt>{{ t('customers.field.email') }}</dt>
                <dd class="card__email">{{ row.email }}</dd>
              </div>
              <div>
                <dt>{{ t('customers.field.updatedAt') }}</dt>
                <dd>
                  <time [attr.datetime]="row.updatedAt">{{
                    row.updatedAt | appInstant: 'short'
                  }}</time>
                </dd>
              </div>
              <div>
                <dt>{{ t('customers.field.gender') }}</dt>
                <dd>{{ t(genderKey(row)) }}</dd>
              </div>
            </dl>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    .cards {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .cards__toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .cards__check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.75rem;
      font-size: var(--text-sm);
    }

    .cards__sort {
      flex: 1 1 12rem;
    }

    .cards__list {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    .card--selected {
      border-color: var(--accent);
      background-color: var(--accent-subtle);
    }

    .card__top {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    /* A thumb-sized target: WCAG 2.5.8 asks for 24px, a phone wants more. */
    .card__select {
      width: 1.25rem;
      height: 1.25rem;
      flex: none;
    }

    .card__name {
      flex: 1;
      min-width: 0;
      padding-block: var(--space-2);
      color: var(--accent-text);
      font-weight: var(--weight-semibold);
      overflow-wrap: anywhere;
    }

    .card__facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2) var(--space-4);
      margin: 0;
    }

    .card__facts dt {
      color: var(--text-muted);
      font-size: var(--text-xs);
    }

    .card__facts dd {
      margin: 0;
      font-size: var(--text-sm);
    }

    .card__code {
      font-variant-numeric: tabular-nums;
    }

    .card__email {
      grid-column: 1 / -1;
      overflow-wrap: anywhere;
    }
  `,
})
export class CustomerCardList {
  readonly rows = input.required<readonly Customer[]>();
  /** `field,direction`, as it appears in the URL. */
  readonly sort = input.required<string>();
  readonly selectedIds = input.required<ReadonlySet<CustomerId>>();
  readonly selectable = input(true);

  readonly sortChange = output<string>();
  readonly rowToggled = output<CustomerId>();
  readonly allToggled = output<boolean>();

  /**
   * The sort as a form control, so the shared `app-select` renders it - the
   * same labelled field as every other select, not a second, hand-styled one.
   */
  protected readonly sortControl = new FormControl('', { nonNullable: true });

  constructor() {
    // The URL is the source of truth; the control follows it without echoing
    // the write back out as a change.
    effect(() => {
      const sort = this.sort();
      if (this.sortControl.value !== sort) {
        this.sortControl.setValue(sort, { emitEvent: false });
      }
    });

    this.sortControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      // Validated by the same parser the URL goes through: a value this
      // component did not offer never becomes a sort.
      const { field, direction } = parseSortParam(value);
      this.sortChange.emit(`${field},${direction}`);
    });
  }

  /** Every column the table can sort by, in both directions. */
  protected sortOptions(t: Translate): readonly SelectOption[] {
    return SORTABLE_COLUMNS.flatMap((column) =>
      (['asc', 'desc'] as const).map((direction) => ({
        value: `${column.field},${direction}`,
        label: t(`pages.customers.list.cards.${direction}`, { field: t(column.labelKey) }),
      })),
    );
  }

  protected readonly allSelected = computed(() => {
    const rows = this.rows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });

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
}
