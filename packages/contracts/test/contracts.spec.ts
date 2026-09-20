import { describe, expect, it } from 'vitest';
import {
  API_ERROR_STATUS,
  FIXTURE_USERS,
  ROLE_PERMISSIONS,
  apiErrorBodySchema,
  createCustomerRequestSchema,
  customerListQuerySchema,
  customerSchema,
  dateOnlySchema,
  findFixtureUserById,
  findFixtureUserByUsername,
  instantSchema,
  parseSortParam,
  roleHasPermission,
  updateCustomerRequestSchema,
} from '@ecm/contracts';

/**
 * Contract tests.
 *
 * These guard the agreement itself, not either implementation. A change here
 * that goes unnoticed breaks the application and the mock API at the same time
 * and in the same way - which is the failure that having one definition is
 * supposed to prevent.
 *
 * Imported by package name, so these run against the built artifact the rest
 * of the repository actually consumes - not against source that might compile
 * differently.
 */

describe('wire primitives', () => {
  it('accepts a UTC instant', () => {
    expect(instantSchema.safeParse('2026-09-20T04:00:00.000Z').success).toBe(true);
  });

  it('rejects an instant with an offset, so only one spelling crosses the wire', () => {
    // Allowing both means every comparison needs normalising first, and one
    // place will forget.
    expect(instantSchema.safeParse('2026-09-20T11:00:00+07:00').success).toBe(false);
  });

  it('rejects a date where an instant is required, and the reverse', () => {
    expect(instantSchema.safeParse('2026-09-20').success).toBe(false);
    expect(dateOnlySchema.safeParse('2026-09-20T04:00:00.000Z').success).toBe(false);
  });

  it('accepts a calendar date', () => {
    expect(dateOnlySchema.safeParse('1990-01-01').success).toBe(true);
  });
});

describe('create payload', () => {
  it('applies defaults so the server never has to guess', () => {
    const parsed = createCustomerRequestSchema.parse({
      fullName: 'Ada Lovelace',
      email: 'ada@example.test',
    });

    expect(parsed).toMatchObject({
      status: 'PROSPECT',
      gender: 'UNSPECIFIED',
      tags: [],
      phone: null,
      dateOfBirth: null,
      address: null,
    });
  });

  it('rejects a field the server owns', () => {
    // A client that could send `createdBy` could forge an audit trail, so the
    // payload is strict rather than merely ignoring extras.
    const parsed = createCustomerRequestSchema.safeParse({
      fullName: 'Ada',
      email: 'ada2@example.test',
      createdBy: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(
      createCustomerRequestSchema.safeParse({ fullName: 'Ada', email: 'not-an-email' }).success,
    ).toBe(false);
  });
});

describe('update payload', () => {
  it('requires the version the client last saw', () => {
    // Without it staleness cannot be detected, and the last writer silently
    // wins.
    expect(updateCustomerRequestSchema.safeParse({ fullName: 'New name' }).success).toBe(false);
    expect(
      updateCustomerRequestSchema.safeParse({ fullName: 'New name', version: 3 }).success,
    ).toBe(true);
  });

  it('allows a partial update', () => {
    expect(updateCustomerRequestSchema.safeParse({ version: 1 }).success).toBe(true);
  });
});

describe('list query', () => {
  it('coerces the strings a URL actually carries', () => {
    const parsed = customerListQuerySchema.parse({ page: '3', size: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.size).toBe(50);
  });

  it('defaults to a sensible first page', () => {
    const parsed = customerListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.size).toBe(20);
    expect(parsed.sort).toBe('updatedAt,desc');
  });

  it('caps the page size, so one request cannot ask for everything', () => {
    expect(customerListQuerySchema.safeParse({ size: '10000' }).success).toBe(false);
  });

  it('rejects a malformed sort parameter', () => {
    expect(customerListQuerySchema.safeParse({ sort: 'fullName' }).success).toBe(false);
    expect(customerListQuerySchema.safeParse({ sort: 'fullName,sideways' }).success).toBe(false);
  });

  it('splits a sort parameter the way the URL writes it', () => {
    expect(parseSortParam('updatedAt,desc')).toEqual({ field: 'updatedAt', direction: 'desc' });
  });
});

describe('error envelope', () => {
  it('accepts a validation error with field paths', () => {
    const body = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid customer.',
        correlationId: 'cid-1',
        details: { fieldErrors: { 'address.city': ['Required'] } },
      },
    };
    expect(apiErrorBodySchema.safeParse(body).success).toBe(true);
  });

  it('maps every code to exactly one status', () => {
    const codes = Object.keys(API_ERROR_STATUS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(API_ERROR_STATUS.CONFLICT).toBe(409);
    expect(API_ERROR_STATUS.VALIDATION_FAILED).toBe(422);
    expect(API_ERROR_STATUS.RATE_LIMITED).toBe(429);
  });
});

describe('roles and permissions', () => {
  it('gives ADMIN everything and VIEWER only reading', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toHaveLength(6);
    expect(ROLE_PERMISSIONS.VIEWER).toEqual(['CUSTOMER_READ']);
  });

  it('withholds delete from MANAGER - the gap that makes authorization visible', () => {
    expect(roleHasPermission('MANAGER', 'CUSTOMER_UPDATE')).toBe(true);
    expect(roleHasPermission('MANAGER', 'CUSTOMER_DELETE')).toBe(false);
  });
});

describe('the shared user fixture', () => {
  it('is one list, resolvable by id and by username', () => {
    // Auth, createdBy/updatedBy and the audit actor all resolve against this.
    // Three separate lists would drift, and an audit entry naming a user who
    // cannot sign in is worse than none.
    for (const user of FIXTURE_USERS) {
      expect(findFixtureUserById(user.id)).toEqual(user);
      expect(findFixtureUserByUsername(user.username)).toEqual(user);
    }
  });

  it('has a distinct role per user, so every permission path is reachable', () => {
    expect(FIXTURE_USERS.map((user) => user.role).sort()).toEqual(['ADMIN', 'MANAGER', 'VIEWER']);
  });

  it('contains no credential', () => {
    const serialised = JSON.stringify(FIXTURE_USERS).toLowerCase();
    for (const forbidden of ['password', 'secret', 'token', 'hash']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe('a customer round-trips through its own schema', () => {
  it('parses a complete record', () => {
    const customer = {
      id: '11111111-1111-4111-8111-111111111112',
      customerCode: 'C-000001',
      fullName: 'Nguyễn Văn A',
      email: 'a@example.test',
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
      version: 2,
    };

    const parsed = customerSchema.safeParse(customer);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('rejects a customer code that is not the business format', () => {
    expect(customerSchema.safeParse({ customerCode: '12345' }).success).toBe(false);
  });
});
