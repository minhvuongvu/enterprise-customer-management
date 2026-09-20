import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A scrollable region for a real `<table>`.
 *
 * This is the whole table primitive, on purpose. Rows, columns, sorting and
 * selection belong to the feature that knows what the data is; a generic
 * `<app-data-table [columns]>` ends up carrying business rules within two
 * sprints, which rule 5 of the shared-UI README forbids.
 *
 * What is genuinely generic is the part everyone gets wrong:
 *
 *  - a table wider than its container must scroll *within* the page, or the
 *    whole layout scrolls sideways on a phone;
 *  - a scrollable region must be reachable by keyboard, or a keyboard user
 *    cannot see the columns that are cut off. `tabindex="0"` plus a role and a
 *    label is the documented pattern for that, and the label is why
 *    `caption` is required.
 *
 * The caller projects `<table>` and sets `<caption class="visually-hidden">`
 * or a visible one; sticky headers come from the shared styles below.
 */
@Component({
  selector: 'app-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table" role="region" tabindex="0" [attr.aria-label]="caption()">
      <ng-content />
    </div>
  `,
  styles: `
    .table {
      overflow-x: auto;
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
    }

    /* ::ng-deep reaches the projected <table>, which belongs to the caller's
       style scope. Confined to descendants of .table, so it cannot leak into
       the rest of the page. */
    .table ::ng-deep table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-md);
    }

    .table ::ng-deep th,
    .table ::ng-deep td {
      padding: var(--space-3) var(--space-4);
      border-bottom: var(--border-width) solid var(--border-subtle);
      text-align: start;
      vertical-align: middle;
    }

    .table ::ng-deep thead th {
      position: sticky;
      top: 0;
      z-index: var(--z-sticky);
      background-color: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      white-space: nowrap;
    }

    .table ::ng-deep tbody tr:last-child td {
      border-bottom: none;
    }
  `,
})
export class Table {
  /** Labels the scroll region. Required: an unlabelled region is noise. */
  readonly caption = input.required<string>();
}
