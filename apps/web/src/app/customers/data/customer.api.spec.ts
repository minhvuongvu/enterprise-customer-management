import { HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom, type Observable } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import type { CustomerId } from '@ecm/contracts';
import { isAppError } from '../../core/errors/app-error';
import { provideTestHttp } from '../../core/testing/http-testing';
import { aCustomer, aPage } from '../testing/customer.fixture';
import { CustomerApi } from './customer.api';
import { DEFAULT_CRITERIA } from './customer-list-criteria';
import { READ_RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from './request-policy';

/**
 * The data-access layer, on its own.
 *
 * What is being tested is the contract this class offers everything above it:
 * the request it makes, the validation it performs, and the shape a failure
 * leaves in. Nothing here renders anything.
 */
describe('CustomerApi', () => {
  let api: CustomerApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTestHttp()],
    });
    api = TestBed.inject(CustomerApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  describe('list', () => {
    it('sends paging and sorting always, and a filter only when it is set', () => {
      api.list({ ...DEFAULT_CRITERIA, page: 2, status: 'ACTIVE' }).subscribe();

      const request = backend.expectOne(
        (candidate) => candidate.url === '/api/customers' && candidate.method === 'GET',
      );

      expect(request.request.params.get('page')).toBe('2');
      // Sent explicitly rather than relying on the server's default, or the
      // two would each have their own idea of a page size.
      expect(request.request.params.get('size')).toBe('20');
      expect(request.request.params.get('sort')).toBe('updatedAt,desc');
      expect(request.request.params.get('status')).toBe('ACTIVE');
      expect(request.request.params.has('search')).toBe(false);
      expect(request.request.params.has('gender')).toBe(false);

      request.flush(aPage([aCustomer()]));
    });

    it('treats a 200 with the wrong shape as a server error, not as data', async () => {
      const failure = failureOf(api.list(DEFAULT_CRITERIA));

      backend.expectOne(() => true).flush({ items: [{ id: 'not-a-uuid' }] });

      const error = await failure;
      expect(isAppError(error) && error.kind).toBe('server');
    });

    it('retries a network failure, because the question has not changed', async () => {
      // Fake timers so the backoff does not cost the suite real seconds. The
      // delay is the point of the policy, so it is advanced rather than removed.
      vi.useFakeTimers();
      try {
        const result = firstValueFrom(api.list(DEFAULT_CRITERIA));

        // The first attempt never reaches the server.
        backend.expectOne(() => true).error(new ProgressEvent('error'), { status: 0 });
        await vi.advanceTimersByTimeAsync(RETRY_BASE_DELAY_MS * 2);

        backend.expectOne(() => true).flush(aPage([aCustomer()]));

        expect((await result).items).toHaveLength(1);
        expect(READ_RETRY_ATTEMPTS).toBeGreaterThan(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not retry a rejection the user has to act on', async () => {
      const failure = failureOf(api.list(DEFAULT_CRITERIA));

      // A 403 will still be a 403 in 200 milliseconds. Retrying only delays
      // the message the user needs.
      backend.expectOne(() => true).flush(null, { status: 403, statusText: 'Forbidden' });

      const error = await failure;
      expect(isAppError(error) && error.kind).toBe('authorization');
      backend.verify();
    });
  });

  describe('writes', () => {
    it('PATCHes only what it was given, with the version', () => {
      const id = aCustomer().id;
      api.update(id, { fullName: 'New name', version: 3 }).subscribe();

      const request = backend.expectOne(`/api/customers/${id}`);
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ fullName: 'New name', version: 3 });

      request.flush(aCustomer({ fullName: 'New name', version: 4 }));
    });

    it('never retries a write, because a repeated create is a duplicate record', async () => {
      const failure = failureOf(api.create({ ...createInput() }));

      backend.expectOne('/api/customers').error(new ProgressEvent('error'), { status: 0 });

      const error = await failure;
      expect(isAppError(error) && error.kind).toBe('network');
      // The absence of a second request is the assertion; `verify` in
      // afterEach fails if one was made.
    });

    it('reports a bulk result unchanged, including the per-item failures', async () => {
      const ids = [aCustomer().id, '33333333-3333-4333-8333-333333333334' as CustomerId];
      const result = firstValueFrom(api.bulk({ action: 'DELETE', ids }));

      backend.expectOne('/api/customers/bulk').flush({
        requested: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { id: ids[0], outcome: 'SUCCEEDED' },
          { id: ids[1], outcome: 'FAILED', errorCode: 'CONFLICT' },
        ],
      });

      expect((await result).results[1]).toEqual({
        id: ids[1],
        outcome: 'FAILED',
        errorCode: 'CONFLICT',
      });
    });
  });

  describe('findByEmail', () => {
    it('matches the whole address, not the substring the search returns', async () => {
      const result = firstValueFrom(api.findByEmail('an@example.test'));

      // The list endpoint searches by substring, so "an@example.test" would
      // otherwise be reported as taken by "an@example.test.vn".
      backend
        .expectOne((candidate) => candidate.params.get('search') === 'an@example.test')
        .flush(aPage([aCustomer({ email: 'an@example.test.vn' })]));

      expect(await result).toBeNull();
    });

    it('returns the customer that owns the address', async () => {
      const result = firstValueFrom(api.findByEmail('an@example.test'));
      backend.expectOne(() => true).flush(aPage([aCustomer()]));

      expect((await result)?.email).toBe('an@example.test');
    });
  });
});

function createInput() {
  return {
    fullName: 'Nguyễn Văn A',
    email: 'an@example.test',
    phone: null,
    dateOfBirth: null,
    gender: 'UNSPECIFIED' as const,
    status: 'PROSPECT' as const,
    address: null,
    tags: [],
  };
}

/**
 * Resolves with the error an observable failed with.
 *
 * Subscribes immediately, so the request is in flight before the test flushes
 * it - which is the order HttpTestingController requires.
 */
function failureOf(source: Observable<unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    source.subscribe({ next: () => undefined, error: resolve });
  });
}
