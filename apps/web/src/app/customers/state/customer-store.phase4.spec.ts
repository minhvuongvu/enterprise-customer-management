import { HttpEventType } from '@angular/common/http';
import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { isAppError } from '../../core/errors/app-error';
import { provideTestHttp } from '../../core/testing/http-testing';
import { provideSignedInAs } from '../../core/testing/session-testing';
import { DEFAULT_CRITERIA } from '../data/customer-list-criteria';
import type { Transfer } from '../data/transfer';
import { aCustomer, aPage } from '../testing/customer.fixture';
import { CustomerCache } from './customer-cache';
import { CustomerStore } from './customer-store';
import { valueOf } from './remote-data';

/**
 * The store's Phase 4 behaviour: optimistic status changes and their
 * rollback, news from other users, the list refetching only when watched, and
 * file transfers that report progress and really cancel.
 */
describe('CustomerStore (optimistic, realtime, files)', () => {
  let store: CustomerStore;
  let cache: CustomerCache;
  let backend: HttpTestingController;
  const customer = aCustomer({ status: 'ACTIVE', version: 3 });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestHttp(), provideSignedInAs('admin'), CustomerCache, CustomerStore],
    });
    store = TestBed.inject(CustomerStore);
    cache = TestBed.inject(CustomerCache);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function listRequest(): TestRequest {
    return backend.expectOne((request) => request.url === '/api/customers');
  }

  /** The list on screen, and the customer open, both showing `customer`. */
  function showBoth(): () => void {
    const release = store.watchList();
    store.setCriteria(DEFAULT_CRITERIA);
    listRequest().flush(aPage([customer]));
    store.selectCustomer(customer.id);
    backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
    return release;
  }

  function shownStatus(): { detail?: string; row?: string; cached?: string } {
    return {
      detail: valueOf(store.detail())?.status,
      row: valueOf(store.list())?.items[0]?.status,
      cached: cache.getEntity(customer.id)?.status,
    };
  }

  describe('an optimistic status change', () => {
    it('shows the new status everywhere before the server answers', () => {
      showBoth();

      store.changeStatus(customer.id, 'INACTIVE').subscribe();

      expect(shownStatus()).toEqual({ detail: 'INACTIVE', row: 'INACTIVE', cached: 'INACTIVE' });
      expect(store.statusPending().has(customer.id)).toBe(true);

      const request = backend.expectOne(`/api/customers/${customer.id}`);
      // Written against the version the user was looking at.
      expect(request.request.body).toEqual({ status: 'INACTIVE', version: 3 });
      request.flush({ ...customer, status: 'INACTIVE', version: 4 });

      // The server's record - with the new version - replaces the guess.
      expect(valueOf(store.detail())?.version).toBe(4);
      expect(store.statusPending().has(customer.id)).toBe(false);
      listRequest().flush(aPage([{ ...customer, status: 'INACTIVE', version: 4 }]));
    });

    it('rolls back everywhere when the server rejects it', async () => {
      showBoth();

      const outcome = firstValueFrom(store.changeStatus(customer.id, 'INACTIVE')).catch(
        (error: unknown) => error,
      );
      expect(shownStatus().detail).toBe('INACTIVE');

      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(null, { status: 500, statusText: 'Server Error' });

      const error = await outcome;
      expect(isAppError(error) && error.kind).toBe('server');
      // What the user saw happen did not; every copy says so.
      expect(shownStatus()).toEqual({ detail: 'ACTIVE', row: 'ACTIVE', cached: 'ACTIVE' });
      expect(store.statusPending().size).toBe(0);
    });

    it('rolls back on a 409 and reports it as a conflict', async () => {
      showBoth();

      const outcome = firstValueFrom(store.changeStatus(customer.id, 'INACTIVE')).catch(
        (error: unknown) => error,
      );
      backend.expectOne(`/api/customers/${customer.id}`).flush(
        {
          error: {
            code: 'CONFLICT',
            message: 'x',
            correlationId: 'c',
            details: { currentVersion: 5 },
          },
        },
        { status: 409, statusText: 'Conflict' },
      );

      const error = await outcome;
      expect(isAppError(error) && error.kind).toBe('conflict');
      expect(shownStatus().detail).toBe('ACTIVE');
    });

    it('does not roll back over something newer that arrived meanwhile', async () => {
      showBoth();
      const outcome = firstValueFrom(store.changeStatus(customer.id, 'INACTIVE')).catch(
        (error: unknown) => error,
      );
      const write = backend.expectOne({ method: 'PATCH', url: `/api/customers/${customer.id}` });

      // The user refreshes while the write is in flight, and the server says
      // someone else already made it INACTIVE, at version 9.
      store.refreshDetail();
      backend
        .expectOne({ method: 'GET', url: `/api/customers/${customer.id}` })
        .flush({ ...customer, status: 'INACTIVE', version: 9 });

      write.flush(null, { status: 500, statusText: 'Server Error' });
      await outcome;

      // Rolling back would have put an older record over a newer one.
      expect(valueOf(store.detail())?.version).toBe(9);
    });

    it('refuses without a request when the role may not update', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideTestHttp(), provideSignedInAs('viewer'), CustomerCache, CustomerStore],
      });
      const viewerStore = TestBed.inject(CustomerStore);
      backend = TestBed.inject(HttpTestingController);

      const error = await firstValueFrom(viewerStore.changeStatus(customer.id, 'INACTIVE')).catch(
        (failure: unknown) => failure,
      );
      expect(isAppError(error) && error.kind).toBe('authorization');
    });
  });

  describe('news from another user', () => {
    it('refetches the list on screen, and flags - never replaces - the open record', () => {
      showBoth();

      store.applyRemoteChange(customer.id, 'updated');

      // The list holds nothing the user typed; it is simply brought up to date.
      listRequest().flush(aPage([{ ...customer, fullName: 'Changed Elsewhere' }]));
      // The record on screen is left as it is, and says it may be out of date.
      expect(valueOf(store.detail())?.fullName).toBe(customer.fullName);
      expect(store.detailStaleness()).toBe('updated');

      store.refreshDetail();
      expect(store.detailStaleness()).toBeNull();
      backend.expectOne(`/api/customers/${customer.id}`).flush({ ...customer, version: 4 });
    });

    it('marks a list nobody is watching stale, and refetches it on the next visit', () => {
      const release = showBoth();
      release();

      store.applyRemoteChange(customer.id, 'updated');
      // Nobody is looking: no request (debt row 15, paid).
      backend.expectNone((request) => request.url === '/api/customers');

      // The same criteria again would normally be skipped - but they are stale.
      store.watchList();
      store.setCriteria(DEFAULT_CRITERIA);
      listRequest().flush(aPage([customer]));
    });

    it('flags the open record as unverified after a resync, rather than claiming a change', () => {
      showBoth();

      store.revalidateAll();

      listRequest().flush(aPage([customer]));
      expect(store.detailStaleness()).toBe('unverified');
    });
  });

  describe('avatar upload', () => {
    const file = new File([new Uint8Array([0x89, 0x50])], 'a.png', { type: 'image/png' });

    it('reports progress, then refetches the record whose version the upload moved', () => {
      store.selectCustomer(customer.id);
      backend.expectOne(`/api/customers/${customer.id}`).flush(customer);

      const seen: Transfer<unknown>[] = [];
      store.uploadAvatar(customer.id, file).subscribe((transfer) => seen.push(transfer));

      const upload = backend.expectOne(`/api/customers/${customer.id}/avatar`);
      expect(upload.request.reportUploadProgress).toBe(true);
      expect(upload.request.body).toBeInstanceOf(FormData);

      upload.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
      upload.flush({
        customerId: customer.id,
        avatarUrl: `/api/customers/${customer.id}/avatar`,
        sizeBytes: 2,
        contentType: 'image/png',
      });

      expect(seen[0]).toEqual({ kind: 'progress', loaded: 50, total: 100 });
      expect(seen.at(-1)?.kind).toBe('done');
      backend.expectOne(`/api/customers/${customer.id}`).flush({ ...customer, version: 4 });
    });

    it('aborts the request when the upload is cancelled', () => {
      const subscription = store.uploadAvatar(customer.id, file).subscribe();
      const upload = backend.expectOne(`/api/customers/${customer.id}/avatar`);

      subscription.unsubscribe();

      // Not a hidden progress bar: the request itself is gone.
      expect(upload.cancelled).toBe(true);
    });
  });

  describe('import', () => {
    const csv = new File(['fullName,email\nA,a@example.test\n'], 'people.csv', {
      type: 'text/csv',
    });

    it('previews without writing, then imports and refetches the list', () => {
      store.watchList();
      store.setCriteria(DEFAULT_CRITERIA);
      listRequest().flush(aPage([customer]));

      let previewed = false;
      store.previewImport(csv).subscribe((transfer) => (previewed ||= transfer.kind === 'done'));
      const preview = backend.expectOne((request) => request.url === '/api/customers/import');
      expect(preview.request.params.get('mode')).toBe('preview');
      preview.flush({
        totalRows: 1,
        validRows: 1,
        invalidRows: 0,
        missingColumns: [],
        unknownColumns: [],
        rows: [{ row: 2, fullName: 'A', email: 'a@example.test', status: '', valid: true }],
        errors: [],
        errorsTruncated: false,
      });
      expect(previewed).toBe(true);

      store.importFile(csv).subscribe();
      const commit = backend.expectOne((request) => request.url === '/api/customers/import');
      expect(commit.request.params.get('mode')).toBe('commit');
      commit.flush({
        totalRows: 1,
        succeeded: 1,
        failed: 0,
        errors: [],
        errorsTruncated: false,
        completedAt: '2026-09-25T10:00:00.000Z',
      });

      listRequest().flush(aPage([customer]));
    });
  });
});
