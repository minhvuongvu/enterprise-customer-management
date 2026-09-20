import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { BulkAction, BulkResponse, CustomerId } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { distinctUntilChanged } from 'rxjs';
import { Logger } from '../../core/logging/logger';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { Button } from '../../shared/ui/button/button';
import { Dialog } from '../../shared/ui/dialog/dialog';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Select, type SelectOption } from '../../shared/ui/select/select';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import {
  criteriaToQueryParams,
  hasActiveFilters,
  PAGE_SIZE_OPTIONS,
  readCriteria,
  withFilterChange,
  type CustomerListCriteria,
} from '../data/customer-list-criteria';
import { CustomerStore } from '../state/customer-store';
import { valueOf } from '../state/remote-data';
import { CustomerBulkBar } from './customer-bulk-bar';
import { CustomerFilters } from './customer-filters';
import { CustomerTable } from './customer-table';

/**
 * The customer list.
 *
 * This page is the place where the four kinds of state in this feature meet,
 * and keeping them apart is most of its job:
 *
 * | State              | Lives in                  | Survives a reload |
 * | ------------------ | ------------------------- | ----------------- |
 * | criteria           | the URL                   | yes               |
 * | the page of rows   | `CustomerStore` + cache   | no                |
 * | which rows are set | a signal here             | no                |
 * | the bulk report    | a signal here             | no                |
 *
 * **Criteria are read, never held.** The eight query parameters arrive as
 * component inputs and are normalised once into a `CustomerListCriteria`. When
 * something changes them the page navigates, and the new criteria come back in
 * through the same door. There is deliberately no `page` field on this class:
 * a second copy would be the thing that gets out of step with the URL.
 *
 * **Selection is local, and resets with the criteria.** It is not in the URL -
 * a link that carries twenty ids is not a link anyone shares, and restoring a
 * selection made against a different page of results is how the wrong records
 * get deleted. Changing page, filter or sort clears it, on purpose.
 */
@Component({
  selector: 'app-customer-list-page',
  imports: [
    Button,
    CustomerBulkBar,
    CustomerFilters,
    CustomerTable,
    Dialog,
    EmptyState,
    ErrorState,
    PageContainer,
    PageHeader,
    Pagination,
    ReactiveFormsModule,
    Select,
    Skeleton,
    TranslocoDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-container *transloco="let t">
      <app-page-header
        [heading]="t('pages.customers.list.heading')"
        [description]="t('pages.customers.list.description')"
      >
        <div pageActions>
          <app-button
            variant="secondary"
            [loading]="pending()"
            (click)="refresh()"
            data-testid="refresh"
          >
            {{ t('pages.customers.list.refresh') }}
          </app-button>
          <app-button variant="primary" link="/customers/new">
            {{ t('pages.customers.list.create') }}
          </app-button>
        </div>
      </app-page-header>

      <app-customer-filters [criteria]="criteria()" (criteriaChange)="applyCriteria($event)" />

      @if (selectedCount() > 0) {
        <app-customer-bulk-bar
          [count]="selectedCount()"
          [running]="bulkRunning()"
          [result]="bulkResult()"
          (activate)="runBulk('ACTIVATE')"
          (deactivate)="runBulk('DEACTIVATE')"
          (remove)="confirmingBulkDelete.set(true)"
          (clear)="clearSelection()"
        />
      }

      <!-- aria-busy rather than replacing the table while refreshing: the rows
           on screen are still the answer to this question, and swapping them
           for a skeleton on every revisit is what makes a list feel unstable. -->
      <section
        class="results"
        [attr.aria-busy]="pending() ? 'true' : 'false'"
        [attr.aria-label]="t('pages.customers.list.resultsLabel')"
      >
        @switch (view()) {
          @case ('loading') {
            <app-skeleton [lines]="8" />
            <p class="visually-hidden" role="status">{{ t('pages.customers.list.loading') }}</p>
          }

          @case ('error') {
            <app-error-state
              [heading]="t('pages.customers.list.errorHeading')"
              [description]="t(errorMessageKey())"
              [retryLabel]="needsSignIn() ? '' : t('common.retry')"
              (retry)="refresh()"
              data-testid="list-error"
            >
            </app-error-state>

            @if (needsSignIn()) {
              <p class="results__signin">
                <app-button variant="primary" link="/login">
                  {{ t('pages.customers.list.signIn') }}
                </app-button>
              </p>
            }
          }

          @case ('empty') {
            <app-empty-state
              [heading]="t('pages.customers.list.emptyHeading')"
              [description]="
                filtered()
                  ? t('pages.customers.list.emptyFiltered')
                  : t('pages.customers.list.emptyUnfiltered')
              "
              data-testid="list-empty"
            >
              @if (filtered()) {
                <app-button (click)="resetFilters()">
                  {{ t('pages.customers.list.filters.reset') }}
                </app-button>
              } @else {
                <app-button variant="primary" link="/customers/new">
                  {{ t('pages.customers.list.create') }}
                </app-button>
              }
            </app-empty-state>
          }

          @case ('rows') {
            @if (staleWarning()) {
              <p class="results__stale" role="alert" data-testid="stale-warning">
                {{ t('pages.customers.list.refreshFailed') }}
              </p>
            }

            <app-customer-table
              [rows]="rows()"
              [sort]="criteria().sort"
              [selectedIds]="selected()"
              (sortChange)="applySort($event)"
              (rowToggled)="toggleRow($event)"
              (allToggled)="toggleAll($event)"
            />

            <div class="results__footer">
              <p class="results__summary" data-testid="list-summary">
                {{
                  t('pages.customers.list.summary', {
                    shown: rows().length,
                    total: totalItems(),
                  })
                }}
              </p>

              <div class="results__size">
                <app-select
                  name="size"
                  [formControl]="sizeControl"
                  [label]="t('pages.customers.list.pageSize')"
                  [options]="sizeOptions"
                />
              </div>

              <app-pagination
                [page]="criteria().page"
                [totalPages]="totalPages()"
                (pageChange)="goToPage($event)"
              />
            </div>
          }
        }
      </section>

      <app-dialog
        [open]="confirmingBulkDelete()"
        [heading]="t('pages.customers.list.bulk.confirmHeading')"
        (closed)="confirmingBulkDelete.set(false)"
      >
        <p>{{ t('pages.customers.list.bulk.confirmBody', { count: selectedCount() }) }}</p>

        <div dialogActions>
          <app-button (click)="confirmingBulkDelete.set(false)">{{
            t('common.cancel')
          }}</app-button>
          <app-button
            variant="danger"
            (click)="confirmBulkDelete()"
            data-testid="bulk-delete-confirm"
          >
            {{ t('pages.customers.list.bulk.delete') }}
          </app-button>
        </div>
      </app-dialog>
    </app-page-container>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .results {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .results[aria-busy='true'] app-customer-table {
      opacity: 0.6;
      transition: opacity var(--motion-fast) var(--motion-ease);
    }

    .results__stale {
      padding: var(--space-2) var(--space-3);
      border: var(--border-width) solid var(--danger);
      border-radius: var(--radius-md);
      background-color: var(--danger-subtle);
      color: var(--danger-text);
      font-size: var(--text-sm);
    }

    .results__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .results__summary {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .results__size {
      width: 8rem;
    }

    .results__signin {
      display: flex;
      justify-content: center;
    }

    @media #{bp.$below-tablet} {
      .results__footer {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
})
export class CustomerListPage {
  // The eight query parameters, bound by `withComponentInputBinding`. They are
  // raw strings on purpose: validation belongs in one place, and that place is
  // `readCriteria`, which every caller of the criteria goes through.
  readonly page = input<string>();
  readonly size = input<string>();
  readonly sort = input<string>();
  readonly search = input<string>();
  readonly status = input<string>();
  readonly gender = input<string>();
  readonly createdFrom = input<string>();
  readonly createdTo = input<string>();

  private readonly store = inject(CustomerStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(Logger);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly criteria = computed<CustomerListCriteria>(() =>
    readCriteria({
      page: this.page(),
      size: this.size(),
      sort: this.sort(),
      search: this.search(),
      status: this.status(),
      gender: this.gender(),
      createdFrom: this.createdFrom(),
      createdTo: this.createdTo(),
    }),
  );

  private readonly state = this.store.list;

  protected readonly rows = computed(() => valueOf(this.state())?.items ?? []);
  protected readonly totalItems = computed(() => valueOf(this.state())?.totalItems ?? 0);
  protected readonly totalPages = computed(() => valueOf(this.state())?.totalPages ?? 0);
  protected readonly pending = computed(
    () => this.state().status === 'loading' || this.state().status === 'refreshing',
  );
  protected readonly filtered = computed(() => hasActiveFilters(this.criteria()));

  /**
   * Which of the four renderings the section shows.
   *
   * Derived in one place from the state machine rather than as a chain of
   * `@if`s in the template, so the cases are exhaustive and visibly mutually
   * exclusive. "Empty" appears here - it is a rendering of a successful
   * response with no rows, not a state the store has to track.
   */
  protected readonly view = computed<'loading' | 'error' | 'empty' | 'rows'>(() => {
    const state = this.state();
    if (state.status === 'idle' || state.status === 'loading') {
      return 'loading';
    }
    if (state.status === 'error' && state.value === null) {
      return 'error';
    }
    return this.rows().length === 0 ? 'empty' : 'rows';
  });

  /** An error while stale rows are still on screen: warn, do not replace. */
  protected readonly staleWarning = computed(() => this.state().status === 'error');

  protected readonly errorMessageKey = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.error.messageKey : 'errors.unknown';
  });

  protected readonly needsSignIn = computed(() => {
    const state = this.state();
    return state.status === 'error' && state.error.kind === 'authentication';
  });

  // ------------------------------------------------------------- selection

  private readonly selectedIds = signal<ReadonlySet<CustomerId>>(new Set());
  protected readonly selected = this.selectedIds.asReadonly();
  protected readonly selectedCount = computed(() => this.selectedIds().size);

  protected readonly bulkRunning = signal(false);
  protected readonly bulkResult = signal<BulkResponse | null>(null);
  protected readonly confirmingBulkDelete = signal(false);

  // -------------------------------------------------------------- page size

  protected readonly sizeControl = new FormControl(String(PAGE_SIZE_OPTIONS[1]), {
    nonNullable: true,
  });
  protected readonly sizeOptions: readonly SelectOption[] = PAGE_SIZE_OPTIONS.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  constructor() {
    // One effect, so the order is not an accident: the selection belongs to
    // the page of results that is on screen, so it is cleared *before* the
    // store is asked for a different one.
    effect(() => {
      const criteria = this.criteria();
      this.selectedIds.set(new Set());
      this.bulkResult.set(null);
      this.store.setCriteria(criteria);
    });

    effect(() => {
      const size = String(this.criteria().size);
      if (this.sizeControl.value !== size) {
        this.sizeControl.setValue(size, { emitEvent: false });
      }
    });

    this.sizeControl.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) =>
        this.applyCriteria(withFilterChange(this.criteria(), { size: Number(value) })),
      );
  }

  // ------------------------------------------------------------ navigation

  /**
   * Every change to the list goes through here, and every one of them is a
   * navigation.
   *
   * That is what makes the back button undo the last thing the user did,
   * whether it was a page, a filter or a sort - and what makes the state on
   * screen reconstructible from the address bar alone.
   */
  protected applyCriteria(criteria: CustomerListCriteria): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: criteriaToQueryParams(criteria),
      // Merge, so a parameter this page does not own survives. A `null` value
      // removes the parameter, which is how a reset produces a clean URL
      // instead of `?status=&gender=`.
      queryParamsHandling: 'merge',
    });
  }

  protected goToPage(page: number): void {
    this.applyCriteria({ ...this.criteria(), page });
  }

  protected applySort(sort: string): void {
    this.applyCriteria(withFilterChange(this.criteria(), { sort }));
  }

  protected resetFilters(): void {
    this.applyCriteria(
      withFilterChange(this.criteria(), {
        search: '',
        status: '',
        gender: '',
        createdFrom: '',
        createdTo: '',
      }),
    );
  }

  protected refresh(): void {
    this.store.refreshList();
  }

  // ------------------------------------------------------------- selection

  protected toggleRow(id: CustomerId): void {
    const next = new Set(this.selectedIds());
    if (!next.delete(id)) {
      next.add(id);
    }
    this.selectedIds.set(next);
  }

  protected toggleAll(select: boolean): void {
    this.selectedIds.set(select ? new Set(this.rows().map((row) => row.id)) : new Set());
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
    this.bulkResult.set(null);
  }

  // ------------------------------------------------------------------ bulk

  protected confirmBulkDelete(): void {
    this.confirmingBulkDelete.set(false);
    this.runBulk('DELETE');
  }

  /**
   * Runs a bulk action and keeps whatever failed selected.
   *
   * Clearing the selection on completion would be simpler and would throw away
   * the only thing the user needs: which records still have a problem. The
   * successes leave the selection; the failures stay in it, ready for a retry.
   */
  protected runBulk(action: BulkAction): void {
    const ids = [...this.selectedIds()];
    if (ids.length === 0 || this.bulkRunning()) {
      return;
    }

    this.bulkRunning.set(true);
    this.bulkResult.set(null);

    this.store
      .runBulk(action, ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.bulkRunning.set(false);
          this.bulkResult.set(response);
          this.selectedIds.set(
            new Set(
              response.results
                .filter((result) => result.outcome === 'FAILED')
                .map((result) => result.id),
            ),
          );
        },
        error: (error: unknown) => {
          this.bulkRunning.set(false);
          // A transport failure is not a per-item outcome, so it is reported
          // as one failure for the whole batch rather than faked per record.
          this.bulkResult.set({
            requested: ids.length,
            succeeded: 0,
            failed: ids.length,
            results: ids.map((id) => ({
              id,
              outcome: 'FAILED' as const,
              errorCode: 'INTERNAL_ERROR' as const,
            })),
          });
          this.logger.error('Bulk customer action failed', {
            action,
            count: ids.length,
          });
          void error;
        },
      });
  }
}
