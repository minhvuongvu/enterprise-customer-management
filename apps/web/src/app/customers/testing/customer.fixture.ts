import type { Customer, CustomerId, PageResponse } from '@ecm/contracts';

/**
 * Customers for tests.
 *
 * Test-only: nothing in the application imports this file, so it is not part
 * of any bundle. It lives next to the feature rather than under a shared
 * `testing/` root because a fixture is as domain-specific as the code it
 * exercises, and a repository-wide fixture folder becomes a dumping ground of
 * the kind rule 5 forbids.
 *
 * The defaults are a complete, valid record, so a test only says the part it
 * is actually about - which is what keeps the assertion visible among the
 * sixteen fields a customer has.
 */
export function aCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '11111111-1111-4111-8111-111111111112' as CustomerId,
    customerCode: 'C-000001',
    fullName: 'Nguyễn Văn A',
    email: 'an@example.test',
    phone: '+84900000000',
    dateOfBirth: '1990-01-01',
    gender: 'MALE',
    status: 'ACTIVE',
    address: {
      line1: '1 Lê Lợi',
      line2: null,
      city: 'Hà Nội',
      postalCode: '100000',
      country: 'VN',
    },
    avatarUrl: null,
    tags: ['vip'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdBy: '11111111-1111-4111-8111-111111111111',
    updatedBy: '11111111-1111-4111-8111-111111111111',
    version: 1,
    ...overrides,
  } as Customer;
}

/** A second, different record - for lists, selection and bulk results. */
export function anotherCustomer(overrides: Partial<Customer> = {}): Customer {
  return aCustomer({
    id: '22222222-2222-4222-8222-222222222223' as CustomerId,
    customerCode: 'C-000002',
    fullName: 'Trần Thị B',
    email: 'binh@example.test',
    status: 'PROSPECT',
    gender: 'FEMALE',
    ...overrides,
  });
}

export function aPage(
  items: readonly Customer[],
  overrides: Partial<PageResponse<Customer>> = {},
): PageResponse<Customer> {
  return {
    items: [...items],
    page: 1,
    size: 20,
    totalItems: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    ...overrides,
  };
}
