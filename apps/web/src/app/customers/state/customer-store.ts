import { inject, Injectable, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  AuditEntry,
  BulkAction,
  BulkResponse,
  CreateCustomerRequest,
  AvatarUploadResponse,
  Customer,
  CustomerId,
  CustomerStatus,
  ImportPreview,
  ImportResult,
  PageResponse,
  Permission,
  UpdateCustomerRequest,
} from '@ecm/contracts';
import {
  catchError,
  EMPTY,
  finalize,
  map,
  of,
  Subject,
  switchMap,
  tap,
  throwError,
  type Observable,
} from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { appError, isAppError, type AppError } from '../../core/errors/app-error';
import { CustomerApi, type ExportedFile } from '../data/customer.api';
import type { Transfer } from '../data/transfer';
import { criteriaKey, type CustomerListCriteria } from '../data/customer-list-criteria';
import { CustomerCache } from './customer-cache';
import { failed, idle, reloadFrom, success, valueOf, type RemoteData } from './remote-data';

/**
 * The customer feature's server state - one store for the feature, as
 * ANGULAR_PROJECT_CONTEXT.md §5.5 locks in.
 *
 * ## What it owns, and what it does not
 *
 * It owns three questions and their answers: which page of the list is on
 * screen, which customer is open, and that customer's audit trail. It owns the
 * cache and the invalidation rules. It owns nothing else - and in particular it
 * does **not** own:
 *
 *  - the criteria themselves. Those live in the URL and are pushed in.
 *  - which rows are selected. That is local UI state; putting it here would
 *    make it survive navigation, and a selection that outlives the screen it
 *    was made on is a bug users report as "it deleted the wrong ones".
 *  - form values, or whether a save is in flight. Those belong to the form.
 *
 * ## How a request is made, and cancelled
 *
 * Each of the three concerns is a `Subject` piped through `switchMap`. That
 * single operator provides cancellation: a new value unsubscribes the previous
 * request, which aborts the underlying fetch. Nothing tracks an in-flight
 * request or compares timestamps to decide whether a late response is still
 * wanted - the out-of-order response simply never arrives.
 *
 * Deliberately a `Subject` rather than `toObservable()` over a signal: this
 * pipeline must run the instant it is asked to, not at the next effect flush,
 * so that "typing cancels the previous search" is a property of the code and
 * not of Angular's scheduling.
 *
 * ## Debouncing is not here
 *
 * There is no `debounceTime` in this file. Debouncing belongs where the
 * keystrokes are - the search field waits for typing to settle before it
 * writes to the URL. By the time a request reaches this store it represents a
 * decision the user has made, and delaying it again would be latency nobody
 * asked for. See `customer-filters.ts`.
 *
 * ## Lifetime
 *
 * Provided by the customers route, so one instance serves every page under
 * `/customers` and is destroyed on the way out. That is what makes returning
 * from a detail page to the list instant, and what stops one user's browsing
 * outliving the section it happened in.
 */
@Injectable()
export class CustomerStore {
  private readonly api = inject(CustomerApi);
  private readonly cache = inject(CustomerCache);
  private readonly session = inject(SessionService);

  // ------------------------------------------------------------------- list

  private readonly listRequests = new Subject<CustomerListCriteria>();
  private readonly listState = signal<RemoteData<PageResponse<Customer>>>(idle);
  private activeCriteria: CustomerListCriteria | null = null;

  /** The page currently on screen, with its request state. */
  readonly list: Signal<RemoteData<PageResponse<Customer>>> = this.listState.asReadonly();

  /**
   * How many pages are showing the list right now, and whether what they
   * would see is known to be out of date.
   *
   * A write used to refetch the list whether or not anyone was looking at it
   * (debt row 15). With realtime events arriving for every change anyone
   * makes, that would be a request per event for a list nobody is on. Now a
   * write or an event marks the list stale; it is refetched immediately if it
   * is on screen, and on the way back to it otherwise.
   */
  private listWatchers = 0;
  private listStale = false;

  // ----------------------------------------------------------------- detail

  private readonly detailRequests = new Subject<CustomerId>();
  private readonly detailState = signal<RemoteData<Customer>>(idle);
  private activeId: CustomerId | null = null;

  readonly detail: Signal<RemoteData<Customer>> = this.detailState.asReadonly();

  /**
   * Why the open customer may no longer match the server, if it may not.
   *
   * A realtime event about the record on screen does **not** replace it. The
   * user may be reading it - or editing it, in a form that was filled from it
   * - and data that changes under the cursor is worse than data that is a
   * minute old and says so. The page shows this and offers a refresh; the
   * user decides. ADR-0020.
   */
  private readonly detailStalenessState = signal<DetailStaleness | null>(null);
  readonly detailStaleness = this.detailStalenessState.asReadonly();

  /** Customers whose status is being changed optimistically, awaiting the server. */
  private readonly statusPendingState = signal<ReadonlySet<CustomerId>>(new Set());
  readonly statusPending = this.statusPendingState.asReadonly();

  // ------------------------------------------------------------------ audit

  private readonly auditRequests = new Subject<CustomerId>();
  private readonly auditState = signal<RemoteData<readonly AuditEntry[]>>(idle);
  private activeAuditId: CustomerId | null = null;
  /** Which customer the entries currently in state belong to. */
  private loadedAuditId: CustomerId | null = null;

  readonly audit: Signal<RemoteData<readonly AuditEntry[]>> = this.auditState.asReadonly();

  constructor() {
    this.listRequests
      .pipe(
        switchMap((criteria) => this.fetchList(criteria)),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.detailRequests
      .pipe(
        switchMap((id) => this.fetchDetail(id)),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.auditRequests
      .pipe(
        switchMap((id) => this.fetchAudit(id)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  // ----------------------------------------------------------------- reading

  /**
   * Points the list at a set of criteria, read from the URL.
   *
   * Identical criteria are ignored, which is what stops a re-render or a
   * navigation that changes nothing from issuing a request. The cache still
   * revalidates when the criteria genuinely change and happen to be cached -
   * that is a refresh, not a duplicate.
   */
  setCriteria(criteria: CustomerListCriteria): void {
    const unchanged =
      this.activeCriteria !== null &&
      criteriaKey(this.activeCriteria) === criteriaKey(criteria) &&
      this.listState().status !== 'idle';

    this.activeCriteria = criteria;
    if (!unchanged || this.listStale) {
      this.listStale = false;
      this.listRequests.next(criteria);
    }
  }

  /**
   * Declares that a page is showing the list. Returns the function that
   * undeclares it; the list page calls it on destroy.
   */
  watchList(): () => void {
    this.listWatchers += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.listWatchers -= 1;
      }
    };
  }

  /**
   * Re-asks for the current page - now, if the list is on screen, or on the
   * next visit if it is not. The user pressed refresh, a write landed, or
   * someone else changed a customer.
   */
  refreshList(): void {
    if (!this.activeCriteria) {
      return;
    }
    if (this.listWatchers === 0) {
      this.listStale = true;
      return;
    }
    this.listStale = false;
    this.listRequests.next(this.activeCriteria);
  }

  selectCustomer(id: CustomerId): void {
    const unchanged =
      this.activeId === id &&
      this.detailState().status !== 'idle' &&
      this.detailState().status !== 'error';

    if (this.activeId !== id) {
      this.detailStalenessState.set(null);
    }
    this.activeId = id;
    if (!unchanged) {
      this.detailRequests.next(id);
    }
  }

  refreshDetail(): void {
    if (this.activeId) {
      this.detailStalenessState.set(null);
      this.detailRequests.next(this.activeId);
    }
  }

  // ------------------------------------------------------------ remote news

  /**
   * Someone else created, changed or deleted a customer.
   *
   * The rules, each chosen so an event never fights what the user is doing:
   *
   *  - every cached page is dropped, because any of them might contain it;
   *  - the list refetches if it is on screen - a list holds nothing the user
   *    typed, and its selection survives a refresh;
   *  - the cached copy of that customer is dropped, so the next visit loads it;
   *  - if it is the customer on screen, it is **flagged**, not replaced. See
   *    `detailStaleness`.
   */
  applyRemoteChange(customerId: CustomerId, change: 'updated' | 'deleted' | 'created'): void {
    this.cache.invalidatePages();
    if (change !== 'created') {
      this.cache.dropEntity(customerId);
      if (this.activeId === customerId) {
        this.detailStalenessState.set(change);
      }
    }
    this.refreshList();
  }

  /**
   * The event stream reconnected and could not say what was missed. Anything
   * may have changed: drop what is cached, refetch what is visible, and flag
   * the open record as unverified rather than claiming someone changed it.
   */
  revalidateAll(): void {
    this.cache.invalidatePages();
    this.refreshList();
    if (this.activeId && valueOf(this.detailState()) && !this.detailStalenessState()) {
      this.detailStalenessState.set('unverified');
    }
  }

  selectAuditTrail(id: CustomerId): void {
    const unchanged =
      this.activeAuditId === id &&
      this.auditState().status !== 'idle' &&
      this.auditState().status !== 'error';

    this.activeAuditId = id;
    if (!unchanged) {
      this.auditRequests.next(id);
    }
  }

  refreshAuditTrail(): void {
    if (this.activeAuditId) {
      this.auditRequests.next(this.activeAuditId);
    }
  }

  // --------------------------------------------------------------- mutating

  /**
   * Creates a customer, then drops every cached page.
   *
   * The caller gets the created record so it can navigate to it. The store
   * does not navigate: where to go after a save is a decision about the user's
   * journey, and the store does not know whether this was the "save" button or
   * "save and add another".
   */
  create(input: CreateCustomerRequest): Observable<Customer> {
    return (
      this.refuseUnless('CUSTOMER_CREATE') ??
      this.api.create(input).pipe(
        tap((created) => {
          this.cache.invalidatePages();
          this.cache.putEntity(created);
          this.refreshList();
        }),
      )
    );
  }

  /** Updates, then replaces the cached entity and drops every cached page. */
  update(id: CustomerId, input: UpdateCustomerRequest): Observable<Customer> {
    return (
      this.refuseUnless('CUSTOMER_UPDATE') ??
      this.api.update(id, input).pipe(
        tap((updated) => {
          this.cache.invalidatePages();
          this.cache.putEntity(updated);
          if (this.activeId === updated.id) {
            // The response is the newest version there is, including the
            // concurrency token. Setting it directly means the next edit starts
            // from it rather than from whatever was fetched before the save.
            this.detailState.set(success(updated));
          }
          this.refreshList();
        }),
      )
    );
  }

  remove(id: CustomerId): Observable<void> {
    return (
      this.refuseUnless('CUSTOMER_DELETE') ??
      this.api.remove(id).pipe(
        tap(() => {
          this.cache.invalidatePages();
          this.cache.dropEntity(id);
          if (this.activeId === id) {
            this.detailState.set(idle);
            this.activeId = null;
          }
          this.refreshList();
        }),
      )
    );
  }

  /**
   * Runs a bulk action and hands the per-item outcome back unchanged.
   *
   * The store does not reduce it to success or failure. A batch where 18 of 20
   * items worked is neither, and collapsing it would force the page to either
   * lie or re-check every record.
   */
  runBulk(action: BulkAction, ids: readonly CustomerId[]): Observable<BulkResponse> {
    const permission = action === 'DELETE' ? 'CUSTOMER_DELETE' : 'CUSTOMER_UPDATE';
    return (
      this.refuseUnless(permission) ??
      this.api.bulk({ action, ids: [...ids] }).pipe(
        tap((response) => {
          this.cache.invalidatePages();
          for (const result of response.results) {
            if (result.outcome === 'SUCCEEDED') {
              this.cache.dropEntity(result.id);
            }
          }
          this.refreshList();
        }),
      )
    );
  }

  // ------------------------------------------------------------- optimistic

  /**
   * Activates or deactivates a customer **optimistically**: the new status is
   * on screen at once, and the request confirms it afterwards.
   *
   * Why this operation and no other (ADR-0023): a status change is one field,
   * it is almost always accepted, the user can see and undo it, and nothing
   * else waits on its outcome. A create has no id until the server gives it
   * one; a delete cannot be shown and then un-shown without alarming the
   * user; an edit of many fields can fail validation in ways only the server
   * knows. For those, waiting is the honest UI.
   *
   * On success the server's record replaces the optimistic one - it carries
   * the new version. On failure the previous record is put back **everywhere
   * the optimistic one went**: the open detail, the cached entity, and the
   * page of the list on screen - unless something newer has replaced it in
   * the meantime, which must not be overwritten with something older.
   */
  changeStatus(id: CustomerId, status: CustomerStatus): Observable<Customer> {
    const refused = this.refuseUnless('CUSTOMER_UPDATE');
    if (refused) {
      return refused;
    }
    const before = this.recordFor(id);
    if (!before) {
      return throwError(() => appError('not-found'));
    }
    if (before.status === status) {
      return of(before);
    }

    const optimistic: Customer = { ...before, status };
    this.show(optimistic);
    this.statusPendingState.update((pending) => new Set(pending).add(id));

    return this.api.update(id, { status, version: before.version }).pipe(
      tap((saved) => {
        this.show(saved);
        this.cache.invalidatePages();
        this.refreshList();
      }),
      catchError((error: unknown) => {
        this.rollback(optimistic, before);
        return throwError(() => error);
      }),
      finalize(() =>
        this.statusPendingState.update((pending) => {
          const next = new Set(pending);
          next.delete(id);
          return next;
        }),
      ),
    );
  }

  /** The newest copy of a customer this store holds, from wherever it is. */
  private recordFor(id: CustomerId): Customer | null {
    const detail = this.activeId === id ? valueOf(this.detailState()) : null;
    return (
      detail ??
      this.cache.getEntity(id) ??
      valueOf(this.listState())?.items.find((item) => item.id === id) ??
      null
    );
  }

  /** Puts one customer's record everywhere it is shown. */
  private show(customer: Customer): void {
    this.cache.putEntity(customer);
    if (this.activeId === customer.id && valueOf(this.detailState())) {
      this.detailState.set(success(customer));
    }
    this.listState.update((state) => withItem(state, customer));
  }

  private rollback(optimistic: Customer, before: Customer): void {
    if (this.cache.getEntity(before.id) === optimistic) {
      this.cache.putEntity(before);
    }
    if (this.activeId === before.id && valueOf(this.detailState()) === optimistic) {
      this.detailState.set(success(before));
    }
    this.listState.update((state) =>
      valueOf(state)?.items.some((item) => item === optimistic) ? withItem(state, before) : state,
    );
  }

  // ------------------------------------------------------------------ files

  /**
   * Uploads an avatar. Progress arrives as it happens; unsubscribing cancels
   * the upload. On completion the record is refetched - the upload moved its
   * version, and the next edit must start from the new one.
   */
  uploadAvatar(id: CustomerId, file: File): Observable<Transfer<AvatarUploadResponse>> {
    return (
      this.refuseUnless('CUSTOMER_UPDATE') ??
      this.api.uploadAvatar(id, file).pipe(
        tap((transfer) => {
          if (transfer.kind === 'done') {
            this.cache.invalidatePages();
            if (this.activeId === id) {
              this.refreshDetail();
            }
            this.refreshList();
          }
        }),
      )
    );
  }

  previewImport(file: File): Observable<Transfer<ImportPreview>> {
    return this.refuseUnless('CUSTOMER_IMPORT') ?? this.api.previewImport(file);
  }

  importFile(file: File): Observable<Transfer<ImportResult>> {
    return (
      this.refuseUnless('CUSTOMER_IMPORT') ??
      this.api.importFile(file).pipe(
        tap((transfer) => {
          if (transfer.kind === 'done') {
            this.cache.invalidatePages();
            this.refreshList();
          }
        }),
      )
    );
  }

  /** Exports what the list criteria describe - every page of it. */
  exportCsv(criteria: CustomerListCriteria): Observable<Transfer<ExportedFile>> {
    return this.refuseUnless('CUSTOMER_EXPORT') ?? this.api.exportCsv(criteria);
  }

  /**
   * Is this email address free?
   *
   * Deliberately not cached and deliberately not part of any state signal: it
   * answers a question about *right now*, for one keystroke's worth of typing,
   * and a cached "yes" from two minutes ago is exactly the answer that lets two
   * people create the same customer.
   *
   * It is on the store rather than being called from the form because a
   * component may not reach an API client directly - the async validator gets
   * this, and nothing else.
   */
  isEmailAvailable(email: string, excludeId: CustomerId | null): Observable<boolean> {
    return this.api
      .findByEmail(email)
      .pipe(map((match) => match === null || match.id === excludeId));
  }

  /**
   * Action authorization: a write the user may not perform fails here, as the
   * same `authorization` error the server would have produced, and no request
   * is sent.
   *
   * The buttons for these actions are already hidden from users who lack the
   * permission, so this looks redundant, and the difference is the point. A
   * hidden button is one route to an action; a keyboard shortcut, a bulk bar,
   * a future "duplicate" menu entry are others. Checking at the action rather
   * than at each control means a new control cannot forget to.
   *
   * It is still not security - the server refuses the request on its own - but
   * it keeps a denied action from costing a round trip and a 403 in the logs.
   */
  private refuseUnless(permission: Permission): Observable<never> | null {
    return this.session.hasPermission(permission)
      ? null
      : throwError(() => appError('authorization'));
  }

  // ---------------------------------------------------------------- fetching

  private fetchList(criteria: CustomerListCriteria): Observable<unknown> {
    const key = criteriaKey(criteria);
    const cached = this.cache.getPage(key);
    this.listState.set(reloadFrom(cached));

    return this.api.list(criteria).pipe(
      tap((page) => {
        this.cache.putPage(key, page);
        this.listState.set(success(page));
      }),
      catchError((error: unknown) => {
        // The stale value is carried only when it answers this same request.
        // Leaving a different page's rows on screen under an error banner
        // would be worse than an honest empty failure.
        this.listState.set(failed(toAppError(error), cached));
        return EMPTY;
      }),
    );
  }

  private fetchDetail(id: CustomerId): Observable<unknown> {
    const cached = this.cache.getEntity(id);
    this.detailState.set(reloadFrom(cached));

    return this.api.getById(id).pipe(
      tap((customer) => {
        this.cache.putEntity(customer);
        this.detailState.set(success(customer));
      }),
      catchError((error: unknown) => {
        this.detailState.set(failed(toAppError(error), cached));
        return EMPTY;
      }),
    );
  }

  private fetchAudit(id: CustomerId): Observable<unknown> {
    // The audit trail is not cached. It is the one view whose entire purpose is
    // to be current, and it is read rarely enough that a request per visit
    // costs nothing worth optimising. Re-reading the *same* customer's trail is
    // still a refresh, so the entries stay on screen while it happens - which
    // is why the id it was last loaded for is tracked.
    const previous = this.loadedAuditId === id ? valueOf(this.auditState()) : null;
    this.auditState.set(reloadFrom(previous));

    return this.api.auditTrail(id).pipe(
      tap((entries) => {
        this.loadedAuditId = id;
        this.auditState.set(success(entries));
      }),
      catchError((error: unknown) => {
        this.auditState.set(failed(toAppError(error)));
        return EMPTY;
      }),
    );
  }
}

/** Why the open record may be out of date. */
export type DetailStaleness = 'updated' | 'deleted' | 'unverified';

/** The same list state, with one customer's row replaced if it is on the page. */
function withItem(
  state: RemoteData<PageResponse<Customer>>,
  customer: Customer,
): RemoteData<PageResponse<Customer>> {
  const page = valueOf(state);
  if (!page || !page.items.some((item) => item.id === customer.id)) {
    return state;
  }
  const items = page.items.map((item) => (item.id === customer.id ? customer : item));
  return { ...state, value: { ...page, items } } as RemoteData<PageResponse<Customer>>;
}

/**
 * Everything below the HTTP layer already produces an `AppError`; this is the
 * belt-and-braces for anything that does not, so a store never puts a raw
 * thrown value into state where a template will try to render it.
 */
function toAppError(error: unknown): AppError {
  return isAppError(error) ? error : appError('unknown', { cause: error });
}
