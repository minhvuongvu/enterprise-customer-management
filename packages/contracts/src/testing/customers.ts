import type { Customer, CreateCustomerRequest } from '../customer.js';
import { FIXTURE_USERS } from '../fixtures.js';
import type { PageResponse } from '../pagination.js';
import type { CustomerId, Instant, UserId } from '../primitives.js';

const ADMIN_ID = FIXTURE_USERS[0]?.id as UserId;

/**
 * A complete, valid customer. A test overrides only what it is about, which
 * keeps its assertion visible among the sixteen fields a customer has.
 */
export function aCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '11111111-1111-4111-8111-111111111112' as CustomerId,
    customerCode: 'C-000001',
    fullName: 'Nguyễn Văn A',
    email: 'an@example.test',
    phone: '+84900000000',
    dateOfBirth: '1990-01-01' as Customer['dateOfBirth'],
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
    createdAt: '2026-01-01T00:00:00.000Z' as Instant,
    updatedAt: '2026-01-02T00:00:00.000Z' as Instant,
    createdBy: ADMIN_ID,
    updatedBy: ADMIN_ID,
    version: 1,
    ...overrides,
  };
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

const GIVEN_NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Emma', 'Farid', 'Giang', 'Hiro'] as const;
const FAMILY_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Smith', 'Rossi', 'Tanaka'] as const;
const STATUSES = ['ACTIVE', 'INACTIVE', 'PROSPECT'] as const;

/**
 * `count` distinct, valid customers, generated from their index - the same
 * list every time. For pagination, sorting and "many rows" tests, where a
 * hand-written list would be long and say nothing.
 */
export function customersFrom(count: number, start = 1): Customer[] {
  return Array.from({ length: count }, (_, offset) => {
    const n = start + offset;
    const hex = n.toString(16).padStart(12, '0');
    const given = GIVEN_NAMES[n % GIVEN_NAMES.length];
    const family = FAMILY_NAMES[n % FAMILY_NAMES.length];
    return aCustomer({
      id: `00000000-0000-4000-8000-${hex}` as CustomerId,
      customerCode: `C-${String(n).padStart(6, '0')}`,
      fullName: `${given} ${family}`,
      email: `customer.${n}@example.test`,
      status: STATUSES[n % STATUSES.length],
      updatedAt: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString() as Instant,
    });
  });
}

/** One page of a list response around `items`. */
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

let createSequence = 0;

/**
 * A valid create request with an email no other call has used - tests that
 * create customers against one shared server must not collide on the unique
 * email. Deterministic within a run: the n-th call always gets the n-th email.
 */
export function aCreateCustomerRequest(
  overrides: Partial<CreateCustomerRequest> = {},
): Partial<CreateCustomerRequest> & Pick<CreateCustomerRequest, 'fullName' | 'email'> {
  createSequence += 1;
  return {
    fullName: `Test Customer ${createSequence}`,
    email: `created.${createSequence}@example.test`,
    ...overrides,
  };
}
