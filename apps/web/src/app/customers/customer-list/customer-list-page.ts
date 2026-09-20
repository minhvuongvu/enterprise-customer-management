import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { Pagination } from '../../shared/ui/pagination/pagination';

/**
 * How many pages the paginator pretends to have until Phase 2 asks the API.
 * Named rather than inlined, so the one fabricated number on this page is
 * obvious and easy to delete.
 */
const PLACEHOLDER_TOTAL_PAGES = 12;

/** Query-string values arrive as strings, or not at all. */
function toPositiveInteger(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toText(value: string | undefined): string {
  return value ?? '';
}

/**
 * The customer list - routing only, for now.
 *
 * Phase 2 puts a table, a search field and real data here. What Phase 1 fixes
 * is the thing that is expensive to change afterwards: **list state lives in
 * the URL**, not in a component field.
 *
 * That one decision is what makes `/customers?page=3&search=nguyen` a link a
 * colleague can be sent, a back button that works, and a reload that lands
 * where the user was. A component that kept `page` in a signal would look
 * identical and have none of those properties - and by the time anyone
 * noticed, filters, sorting and selection would be in there with it.
 *
 * The parameters arrive as component inputs (`withComponentInputBinding` in
 * `app.config.ts`) rather than through an `ActivatedRoute` subscription, so
 * the page reads them like any other input and they are trivially settable in
 * a test.
 */
@Component({
  selector: 'app-customer-list-page',
  imports: [Button, EmptyState, PageContainer, PageHeader, Pagination, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.list.heading')"
        [description]="t('pages.customers.list.description')"
      >
        <div pageActions>
          <app-button variant="primary" link="/customers/new">
            {{ t('pages.customers.list.create') }}
          </app-button>
        </div>
      </app-page-header>

      <app-empty-state
        [heading]="t('pages.customers.list.placeholderHeading')"
        [description]="t('pages.customers.list.placeholderBody')"
      />

      <section class="url-state" [attr.aria-label]="t('pages.customers.list.urlStateLabel')">
        <p data-testid="list-url-state">
          {{ t('pages.customers.list.urlState', { page: page(), size: size() }) }}
        </p>
        @if (search()) {
          <p data-testid="list-search">
            {{ t('pages.customers.list.searchState', { search: search() }) }}
          </p>
        }

        <app-pagination [page]="page()" [totalPages]="totalPages" (pageChange)="goToPage($event)" />
      </section>
    </app-page-container>
  `,
  styles: `
    .url-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border: var(--border-width) solid var(--border-subtle);
      border-radius: var(--radius-lg);
      background-color: var(--surface-raised);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class CustomerListPage {
  readonly page = input(1, {
    transform: (value: string | number | undefined) => toPositiveInteger(value, 1),
  });
  readonly size = input(20, {
    transform: (value: string | number | undefined) => toPositiveInteger(value, 20),
  });
  readonly search = input('', { transform: toText });

  protected readonly totalPages = PLACEHOLDER_TOTAL_PAGES;

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * `merge` keeps `search` and `size` when only the page changes, and pushes a
   * history entry, so the back button walks back through pages the way a user
   * expects.
   */
  protected goToPage(page: number): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page },
      queryParamsHandling: 'merge',
    });
  }
}
