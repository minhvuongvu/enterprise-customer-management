import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { BulkAction, BulkResponse, CustomerId } from '@ecm/contracts';
import { TranslocoDirective } from '@jsverse/transloco';
import { distinctUntilChanged } from 'rxjs';
import { IfPermitted } from '../../core/auth/if-permitted.directive';
import { SessionService } from '../../core/auth/session.service';
import { FeatureFlags } from '../../core/config/feature-flags';
import { messageKeyOf } from '../../core/errors/app-error';
import { NumberPipe, PluralPipe } from '../../core/i18n/locale-pipes';
import { Logger } from '../../core/logging/logger';
import { ConfirmationService } from '../../core/notifications/confirmation.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { PageContainer } from '../../layout/page-container';
import { PageHeader } from '../../layout/page-header';
import { LayoutBreakpoints } from '../../layout/layout-breakpoints';
import { Button } from '../../shared/ui/button/button';
import { Dropdown, type DropdownItem } from '../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Select, type SelectOption } from '../../shared/ui/select/select';
import { Skeleton } from '../../shared/ui/skeleton/skeleton';
import {
  criteriaKey,
  criteriaToQueryParams,
  hasActiveFilters,
  PAGE_SIZE_OPTIONS,
  readCriteria,
  withFilterChange,
  type CustomerListCriteria,
} from '../data/customer-list-criteria';
import { fractionOf } from '../data/transfer';
import { FileSaver } from '../files/file-saver';
import { CustomerStore } from '../state/customer-store';
import { valueOf } from '../state/remote-data';
import { CustomerBulkBar } from './customer-bulk-bar';
import { CustomerCardList } from './customer-card-list';
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
    CustomerCardList,
    CustomerFilters,
    CustomerTable,
    Dropdown,
    EmptyState,
    ErrorState,
    IfPermitted,
    PageContainer,
    PageHeader,
    NumberPipe,
    Pagination,
    PluralPipe,
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
          @if (compact()) {
            <!-- On a phone four buttons wrap into a wall above the list. The
                 one most people came for stays a button; the rest move into
                 a menu - the same actions, one tap further away. -->
            <app-button *appIfPermitted="'CUSTOMER_CREATE'" variant="primary" link="/customers/new">
              {{ t('pages.customers.list.create') }}
            </app-button>
            <app-dropdown
              [items]="moreActions(t)"
              [menuLabel]="t('pages.customers.list.moreActions')"
              (itemSelected)="runAction($event)"
              data-testid="more-actions"
            >
              {{ t('pages.customers.list.moreActions') }}
            </app-dropdown>
          } @else {
            <app-button
              variant="secondary"
              [loading]="pending()"
              (click)="refresh()"
              data-testid="refresh"
            >
              {{ t('pages.customers.list.refresh') }}
            </app-button>
            <app-button
              *appIfPermitted="'CUSTOMER_EXPORT'"
              variant="secondary"
              [loading]="exporting()"
              (click)="exportCsv()"
              data-testid="export"
            >
              {{ t('pages.customers.list.export') }}
            </app-button>
            @if (importEnabled()) {
              <app-button
                *appIfPermitted="'CUSTOMER_IMPORT'"
                variant="secondary"
                link="/customers/import"
              >
                {{ t('pages.customers.list.import') }}
              </app-button>
            }
            <app-button *appIfPermitted="'CUSTOMER_CREATE'" variant="primary" link="/customers/new">
              {{ t('pages.customers.list.create') }}
            </app-button>
          }
        </div>
      </app-page-header>

      @if (exportProgress() !== null) {
        <!-- Progress for a download the user started and can keep working
             through: the list stays usable, nothing is blocked. -->
        <p class="export" role="status" data-testid="export-progress">
          {{
            exportProgress() === -1
              ? t('pages.customers.list.exporting')
              : t('pages.customers.list.exportingPercent', { percent: exportProgress() })
          }}
        </p>
      }

      <app-customer-filters [criteria]="criteria()" (criteriaChange)="applyCriteria($event)" />

      @if (selectedCount() > 0) {
        <app-customer-bulk-bar
          [count]="selectedCount()"
          [running]="bulkRunning()"
          [result]="bulkResult()"
          (activate)="runBulk('ACTIVATE')"
          (deactivate)="runBulk('DEACTIVATE')"
          (remove)="confirmBulkDelete()"
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
            <!-- No sign-in branch here any more. An expired session is
                 renewed by the refresh interceptor, and one that cannot be
                 renewed sends the user to sign in from the application root
                 (session-expiry.ts), so this page never has to know. -->
            <app-error-state
              [heading]="t('pages.customers.list.errorHeading')"
              [description]="t(errorMessageKey())"
              [retryLabel]="t('common.retry')"
              (retry)="refresh()"
              data-testid="list-error"
            >
            </app-error-state>
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
                <app-button
                  *appIfPermitted="'CUSTOMER_CREATE'"
                  variant="primary"
                  link="/customers/new"
                >
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

            <!-- A table where there is room for columns, a list of cards
                 where there is not. Same inputs, same outputs: the page does
                 not care which one the user is looking at. -->
            @if (compact()) {
              <app-customer-card-list
                [rows]="rows()"
                [sort]="criteria().sort"
                [selectable]="canBulkEdit()"
                [selectedIds]="selected()"
                (sortChange)="applySort($event)"
                (rowToggled)="toggleRow($event)"
                (allToggled)="toggleAll($event)"
              />
            } @else {
              <app-customer-table
                [rows]="rows()"
                [sort]="criteria().sort"
                [selectable]="canBulkEdit()"
                [selectedIds]="selected()"
                (sortChange)="applySort($event)"
                (rowToggled)="toggleRow($event)"
                (allToggled)="toggleAll($event)"
              />
            }

            <div class="results__footer">
              <p class="results__summary" data-testid="list-summary">
                {{
                  'pages.customers.list.summary'
                    | appPlural: totalItems() : { shown: (rows().length | appNumber) }
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
    </app-page-container>
  `,
  styles: `
    @use 'styles/breakpoints' as bp;

    .export {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .results {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .results[aria-busy='true'] app-customer-table,
    .results[aria-busy='true'] app-customer-card-list {
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
  private readonly session = inject(SessionService);
  private readonly features = inject(FeatureFlags);

  /** Runtime kill switch for bulk import (docs/feature-flags.md). */
  protected readonly importEnabled = computed(() => this.features.isEnabled('customerImport'));
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject(Logger);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmation = inject(ConfirmationService);
  private readonly notifications = inject(NotificationService);
  private readonly files = inject(FileSaver);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly focusReturn = signal<{ selector: string; criteria: string } | null>(null);

  /**
   * The phone layout: cards instead of a table, a menu instead of a row of
   * buttons. Decided in TypeScript rather than CSS because it swaps which
   * components exist, not how they look - rendering both and hiding one
   * would put every row in the DOM twice and every checkbox in the tab order
   * twice.
   */
  private readonly breakpoints = inject(LayoutBreakpoints);
  protected readonly compact = computed(() => this.breakpoints.mode() === 'mobile');

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

  /**
   * Selection exists to run bulk actions, so a user who can run none of them
   * gets no checkboxes. Which of the actions they see is the bulk bar's
   * business; whether to offer selection at all is this page's.
   */
  protected readonly canBulkEdit = computed(
    () =>
      this.session.hasPermission('CUSTOMER_UPDATE') ||
      this.session.hasPermission('CUSTOMER_DELETE'),
  );

  // ------------------------------------------------------------- selection

  private readonly selectedIds = signal<ReadonlySet<CustomerId>>(new Set());
  protected readonly selected = this.selectedIds.asReadonly();
  protected readonly selectedCount = computed(() => this.selectedIds().size);

  protected readonly bulkRunning = signal(false);
  protected readonly bulkResult = signal<BulkResponse | null>(null);

  /** `null` when no export is running; -1 while its size is unknown; else 0-100. */
  protected readonly exportProgress = signal<number | null>(null);
  protected readonly exporting = computed(() => this.exportProgress() !== null);

  // -------------------------------------------------------------- page size

  protected readonly sizeControl = new FormControl(String(PAGE_SIZE_OPTIONS[1]), {
    nonNullable: true,
  });
  protected readonly sizeOptions: readonly SelectOption[] = PAGE_SIZE_OPTIONS.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  constructor() {
    // The store refetches the list on news only while someone is looking.
    this.destroyRef.onDestroy(this.store.watchList());

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
        this.applyCriteria(
          withFilterChange(this.criteria(), { size: Number(value) }),
          'select[name="size"]',
        ),
      );

    // See `returnFocusTo`.
    effect(() => {
      const target = this.focusReturn();
      if (
        target === null ||
        criteriaKey(this.criteria()) !== target.criteria ||
        this.view() !== 'rows' ||
        this.pending()
      ) {
        return;
      }
      this.focusReturn.set(null);
      const selector = target.selector;
      afterNextRender(
        () => {
          const active = this.host.nativeElement.ownerDocument.activeElement;
          const lost = active === null || active === this.host.nativeElement.ownerDocument.body;
          if (lost) {
            this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus();
          }
        },
        { injector: this.injector },
      );
    });
  }

  /**
   * Where focus goes back to once the results for `criteria` have rendered.
   *
   * A page of results that has never been loaded shows a skeleton while it
   * loads (the rows on screen would answer a different question), and the
   * skeleton replaces the table - including the pagination button, sort
   * header or page-size select the user just operated. The focused element
   * is destroyed, focus falls to `<body>`, and the next Tab starts at the top
   * of the document. The keyboard pass in Phase 6 found exactly that.
   *
   * So the control says where it lives, as a selector for its counterpart in
   * the next render, and focus is put there once *those* results are on
   * screen - but only if it was really lost. A cached page never shows the
   * skeleton, so focus is never lost and nothing moves; a user who has
   * already moved on keeps their focus.
   */
  private returnFocusTo(selector: string, criteria: CustomerListCriteria): void {
    this.focusReturn.set({ selector, criteria: criteriaKey(criteria) });
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
  protected applyCriteria(criteria: CustomerListCriteria, focusSelector?: string): void {
    if (focusSelector) {
      this.returnFocusTo(focusSelector, criteria);
    }
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
    this.applyCriteria({ ...this.criteria(), page }, 'app-pagination [aria-current="page"]');
  }

  protected applySort(sort: string): void {
    this.applyCriteria(
      withFilterChange(this.criteria(), { sort }),
      this.compact() ? 'select[name="sort"]' : 'th:not([aria-sort="none"]) button',
    );
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

  /**
   * The secondary page actions, as menu items for the phone layout. The same
   * permissions decide them as decide the buttons (`*appIfPermitted` there,
   * `hasPermission` here) - UX, not security (rule 10).
   */
  protected moreActions(t: (key: string) => string): readonly DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'refresh', label: t('pages.customers.list.refresh'), disabled: this.pending() },
    ];
    if (this.session.hasPermission('CUSTOMER_EXPORT')) {
      items.push({
        id: 'export',
        label: t('pages.customers.list.export'),
        disabled: this.exporting(),
      });
    }
    if (this.importEnabled() && this.session.hasPermission('CUSTOMER_IMPORT')) {
      items.push({ id: 'import', label: t('pages.customers.list.import') });
    }
    return items;
  }

  protected runAction(id: string): void {
    switch (id) {
      case 'refresh':
        this.refresh();
        return;
      case 'export':
        this.exportCsv();
        return;
      case 'import':
        void this.router.navigateByUrl('/customers/import');
        return;
    }
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

  /** Deleting many records is asked about once, through the shared confirmation. */
  protected confirmBulkDelete(): void {
    this.confirmation
      .confirm({
        headingKey: 'pages.customers.list.bulk.confirmHeading',
        bodyKey: 'pages.customers.list.bulk.confirmBody',
        confirmKey: 'pages.customers.list.bulk.delete',
        count: this.selectedCount(),
        tone: 'danger',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.runBulk('DELETE');
        }
      });
  }

  // ---------------------------------------------------------------- export

  /**
   * Exports every customer the current filters match - not only this page.
   *
   * The download runs beside the page: the list stays usable, and progress is
   * reported where the button was pressed. A failure is a toast, because
   * there is nothing on the page for it to belong to.
   */
  protected exportCsv(): void {
    if (this.exporting()) {
      return;
    }
    this.exportProgress.set(-1);
    this.store
      .exportCsv(this.criteria())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transfer) => {
          if (transfer.kind === 'done') {
            this.files.save(transfer.value.blob, transfer.value.fileName);
            this.exportProgress.set(null);
            this.notifications.toast('pages.customers.list.exported');
            return;
          }
          const fraction = fractionOf(transfer);
          this.exportProgress.set(fraction === null ? -1 : Math.round(fraction * 100));
        },
        error: (error: unknown) => {
          this.exportProgress.set(null);
          this.notifications.toast(messageKeyOf(error), { tone: 'danger' });
        },
      });
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
