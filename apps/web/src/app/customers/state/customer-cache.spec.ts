import type { CustomerId } from '@ecm/contracts';
import { aCustomer, anotherCustomer, aPage } from '../testing/customer.fixture';
import { CustomerCache } from './customer-cache';

describe('CustomerCache', () => {
  let cache: CustomerCache;

  beforeEach(() => {
    cache = new CustomerCache();
  });

  it('remembers a page under the key it was stored with', () => {
    const page = aPage([aCustomer()]);
    cache.putPage('1|20|updatedAt,desc|||||', page);

    expect(cache.getPage('1|20|updatedAt,desc|||||')).toBe(page);
    expect(cache.getPage('2|20|updatedAt,desc|||||')).toBeNull();
  });

  it('keeps every customer a page contained, so opening one is instant', () => {
    const first = aCustomer();
    const second = anotherCustomer();
    cache.putPage('key', aPage([first, second]));

    expect(cache.getEntity(first.id)?.email).toBe(first.email);
    expect(cache.getEntity(second.id)?.email).toBe(second.email);
  });

  it('evicts the least recently used page rather than growing without limit', () => {
    for (let index = 0; index < 25; index++) {
      cache.putPage(`page-${index}`, aPage([aCustomer()]));
    }

    // Browsing a 50,000-row dataset must not accumulate it.
    expect(cache.pageCount).toBe(20);
    expect(cache.getPage('page-0')).toBeNull();
    expect(cache.getPage('page-24')).not.toBeNull();
  });

  it('counts a read as a use, so a page being looked at is not the one evicted', () => {
    cache.putPage('kept', aPage([aCustomer()]));
    for (let index = 0; index < 19; index++) {
      cache.putPage(`filler-${index}`, aPage([aCustomer()]));
      // Reading it moves it back to the end of the eviction order.
      cache.getPage('kept');
    }
    cache.putPage('one-too-many', aPage([aCustomer()]));

    expect(cache.getPage('kept')).not.toBeNull();
  });

  it('drops pages but keeps entities when a write invalidates', () => {
    const customer = aCustomer();
    cache.putPage('key', aPage([customer]));

    cache.invalidatePages();

    expect(cache.pageCount).toBe(0);
    // An id still means the same record; only "which records are on page 2"
    // stopped being true.
    expect(cache.getEntity(customer.id)).not.toBeNull();
  });

  it('forgets a customer that no longer exists', () => {
    const customer = aCustomer();
    cache.putEntity(customer);
    cache.dropEntity(customer.id);

    expect(cache.getEntity(customer.id)).toBeNull();
    expect(cache.getEntity('00000000-0000-4000-8000-000000000000' as CustomerId)).toBeNull();
  });
});
