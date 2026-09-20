import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestHttp } from '../../core/testing/http-testing';
import { DEFAULT_CRITERIA, type CustomerListCriteria } from '../data/customer-list-criteria';
import { aCustomer, anotherCustomer, aPage } from '../testing/customer.fixture';
import { CustomerCache } from './customer-cache';
import { CustomerStore } from './customer-store';

/**
 * The feature's server state.
 *
 * Three properties are worth more than the rest, because they are the ones
 * that are invisible until they are wrong: an in-flight request is cancelled
 * when it is superseded, a cached answer is shown while it is revalidated, and
 * every write invalidates what it has made stale.
 */
describe('CustomerStore', () => {
  let store: CustomerStore;
  let cache: CustomerCache;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestHttp(), CustomerCache, CustomerStore],
    });
    store = TestBed.inject(CustomerStore);
    cache = TestBed.inject(CustomerCache);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function listRequest(): TestRequest {
    return backend.expectOne((request) => request.url === '/api/customers');
  }

  function criteria(overrides: Partial<CustomerListCriteria> = {}): CustomerListCriteria {
    return { ...DEFAULT_CRITERIA, ...overrides };
  }

  describe('the list', () => {
    it('starts idle and asks for what it is given', () => {
      expect(store.list().status).toBe('idle');

      store.setCriteria(criteria());
      expect(store.list().status).toBe('loading');

      listRequest().flush(aPage([aCustomer()]));
      expect(store.list().status).toBe('success');
    });

    it('ignores criteria that are already on screen', () => {
      store.setCriteria(criteria({ page: 2 }));
      listRequest().flush(aPage([aCustomer()]));

      // A re-render, or a navigation that changed nothing, must not cost a
      // request. `verify` in afterEach fails if one was made.
      store.setCriteria(criteria({ page: 2 }));
      expect(store.list().status).toBe('success');
    });

    it('cancels the request in flight when the criteria change', () => {
      store.setCriteria(criteria({ search: 'ngu' }));
      const superseded = listRequest();

      store.setCriteria(criteria({ search: 'nguyen' }));

      // This is the whole of the cancellation story: `switchMap` unsubscribes,
      // which aborts the request. Nothing compares timestamps or request ids,
      // so a late response cannot overwrite a newer one - it never arrives.
      expect(superseded.cancelled).toBe(true);

      listRequest().flush(aPage([aCustomer()]));
      expect(store.list().status).toBe('success');
    });

    it('shows a cached page immediately and revalidates it', () => {
      const page = aPage([aCustomer()]);
      store.setCriteria(criteria({ page: 2 }));
      listRequest().flush(page);

      store.setCriteria(criteria({ page: 3 }));
      listRequest().flush(aPage([anotherCustomer()]));

      store.setCriteria(criteria({ page: 2 }));

      // Not `loading`: the rows for this exact question are already here, so
      // replacing them with a skeleton would be a flicker, not information.
      const state = store.list();
      expect(state.status).toBe('refreshing');
      expect(state.status === 'refreshing' && state.value.items[0].id).toBe(page.items[0].id);

      listRequest().flush(page);
    });

    it('keeps the stale rows when a refresh fails, and says so', () => {
      store.setCriteria(criteria());
      listRequest().flush(aPage([aCustomer()]));

      store.refreshList();
      listRequest().flush(null, { status: 500, statusText: 'Server Error' });

      const state = store.list();
      expect(state.status).toBe('error');
      // The rows are still the best answer available; the page shows them
      // under a warning rather than blanking the table.
      expect(state.status === 'error' && state.value?.items).toHaveLength(1);
    });

    it('has nothing to show when the first load fails', () => {
      store.setCriteria(criteria());
      listRequest().flush(null, { status: 500, statusText: 'Server Error' });

      const state = store.list();
      expect(state.status === 'error' && state.value).toBeNull();
      expect(state.status === 'error' && state.error.kind).toBe('server');
    });
  });

  describe('the detail', () => {
    it('renders a customer the list already fetched, then revalidates it', () => {
      const customer = aCustomer();
      store.setCriteria(criteria());
      listRequest().flush(aPage([customer]));

      store.selectCustomer(customer.id);

      // Clicking a row must not show a spinner for data the store is holding.
      expect(store.detail().status).toBe('refreshing');
      backend.expectOne(`/api/customers/${customer.id}`).flush(customer);
      expect(store.detail().status).toBe('success');
    });

    it('reports a 404 as not-found rather than as a generic failure', () => {
      const customer = aCustomer();
      store.selectCustomer(customer.id);
      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(null, { status: 404, statusText: 'Not Found' });

      const state = store.detail();
      expect(state.status === 'error' && state.error.kind).toBe('not-found');
    });
  });

  describe('invalidation', () => {
    it('drops every cached page after an update, and reloads the list', () => {
      const customer = aCustomer();
      store.setCriteria(criteria());
      listRequest().flush(aPage([customer]));
      expect(cache.pageCount).toBe(1);

      store.update(customer.id, { fullName: 'New name', version: 1 }).subscribe();
      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(aCustomer({ fullName: 'New name', version: 2 }));

      // Not patched in place: a write can move a record onto a different page
      // - under `updatedAt,desc` an edit moves it to page one - so a patched
      // cache would be self-consistent and wrong.
      expect(cache.pageCount).toBe(0);
      expect(cache.getEntity(customer.id)?.fullName).toBe('New name');

      listRequest().flush(aPage([aCustomer({ fullName: 'New name', version: 2 })]));
    });

    it('forgets a deleted customer and reloads the list', () => {
      const customer = aCustomer();
      store.setCriteria(criteria());
      listRequest().flush(aPage([customer]));

      store.remove(customer.id).subscribe();
      backend
        .expectOne(`/api/customers/${customer.id}`)
        .flush(null, { status: 204, statusText: 'No Content' });

      expect(cache.getEntity(customer.id)).toBeNull();
      expect(cache.pageCount).toBe(0);

      listRequest().flush(aPage([]));
    });

    it('drops only the customers a bulk action actually changed', () => {
      const first = aCustomer();
      const second = anotherCustomer();
      store.setCriteria(criteria());
      listRequest().flush(aPage([first, second]));

      store.runBulk('DEACTIVATE', [first.id, second.id]).subscribe();
      backend.expectOne('/api/customers/bulk').flush({
        requested: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { id: first.id, outcome: 'SUCCEEDED' },
          { id: second.id, outcome: 'FAILED', errorCode: 'CONFLICT' },
        ],
      });

      expect(cache.getEntity(first.id)).toBeNull();
      // The one that failed did not change, so the copy that is held is still
      // accurate. Dropping it would cost a request to learn nothing.
      expect(cache.getEntity(second.id)).not.toBeNull();

      listRequest().flush(aPage([second]));
    });
  });

  describe('email availability', () => {
    it('does not report a customer as a clash with itself', async () => {
      const customer = aCustomer();
      const answer = new Promise<boolean>((resolve) =>
        store.isEmailAvailable(customer.email, customer.id).subscribe(resolve),
      );

      backend
        .expectOne((request) => request.params.get('search') === customer.email)
        .flush(aPage([customer]));

      // Editing a customer without changing the email must not fail on
      // "already taken" - by itself.
      expect(await answer).toBe(true);
    });
  });
});
