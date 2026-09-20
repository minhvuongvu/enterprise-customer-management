import { customerSchema } from '@ecm/contracts';
import { describe, expect, it } from 'vitest';
import { createRng, generateCustomers } from '../src/domain/seed.ts';

/**
 * The dataset is reproducible.
 *
 * Without this, "customer C-000042" means something different on every machine,
 * a screenshot cannot be compared, and a failing test cannot be re-run with the
 * data that broke it.
 */

describe('deterministic generation', () => {
  it('produces an identical dataset for the same seed', () => {
    const first = generateCustomers(20260920, 200);
    const second = generateCustomers(20260920, 200);

    // Compared as a whole rather than field by field: any drift at all, in any
    // field, should fail this.
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('produces a different dataset for a different seed', () => {
    const a = generateCustomers(1, 50);
    const b = generateCustomers(2, 50);
    expect(JSON.stringify(b)).not.toBe(JSON.stringify(a));
  });

  it('is a prefix-stable generator: the first N records do not depend on the total', () => {
    // Makes a small test dataset a genuine subset of the large one, so a bug
    // found with 50 records is reproducible with 50,000.
    const small = generateCustomers(7, 10);
    const large = generateCustomers(7, 100);
    expect(JSON.stringify(large.slice(0, 10))).toBe(JSON.stringify(small));
  });

  it('never uses Math.random - the same run twice gives the same rng stream', () => {
    const a = createRng(42);
    const b = createRng(42);
    const drawsA = Array.from({ length: 20 }, () => a());
    const drawsB = Array.from({ length: 20 }, () => b());
    expect(drawsB).toEqual(drawsA);
  });
});

describe('generated data is valid and realistic', () => {
  const customers = generateCustomers(20260920, 500);

  it('satisfies the published contract', () => {
    for (const customer of customers) {
      const parsed = customerSchema.safeParse(customer);
      expect(
        parsed.success,
        `${customer.customerCode}: ${JSON.stringify(parsed.error?.issues)}`,
      ).toBe(true);
    }
  });

  it('has unique emails, so the duplicate-email conflict stays testable', () => {
    const emails = new Set(customers.map((customer) => customer.email.toLowerCase()));
    expect(emails.size).toBe(customers.length);
  });

  it('has unique customer codes', () => {
    expect(new Set(customers.map((customer) => customer.customerCode)).size).toBe(customers.length);
  });

  it('never updates a record before it was created', () => {
    // Otherwise "sort by updatedAt" produces nonsense that looks like a
    // frontend bug.
    expect(customers.every((customer) => customer.updatedAt >= customer.createdAt)).toBe(true);
  });

  it('leaves optional fields empty sometimes, as real data does', () => {
    expect(customers.some((customer) => customer.phone === null)).toBe(true);
    expect(customers.some((customer) => customer.address === null)).toBe(true);
    expect(customers.some((customer) => customer.dateOfBirth === null)).toBe(true);
    expect(customers.some((customer) => customer.tags.length > 0)).toBe(true);
  });

  it('includes non-ASCII names, which is where sorting and layout break', () => {
    const hasNonAscii = (value: string): boolean =>
      [...value].some((character) => (character.codePointAt(0) ?? 0) > 127);

    expect(customers.some((customer) => hasNonAscii(customer.fullName))).toBe(true);
  });

  it('covers every status', () => {
    const statuses = new Set(customers.map((customer) => customer.status));
    expect([...statuses].sort()).toEqual(['ACTIVE', 'INACTIVE', 'PROSPECT']);
  });

  it('attributes every record to a user from the shared fixture', () => {
    const fixtureIds = new Set([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(customers.every((customer) => fixtureIds.has(customer.createdBy))).toBe(true);
    expect(customers.every((customer) => fixtureIds.has(customer.updatedBy))).toBe(true);
  });
});
