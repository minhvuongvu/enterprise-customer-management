import { describe, expect, it } from 'vitest';
import { createCustomerRequestSchema, customerSchema, pageResponseSchema } from '@ecm/contracts';
import {
  aCreateCustomerRequest,
  aCustomer,
  anotherCustomer,
  aPage,
  customersFrom,
} from '@ecm/contracts/testing';

/**
 * The shared test data is valid against the schemas it stands in for.
 *
 * Without this, a fixture that drifted from the contract would make every
 * test that uses it pass against data the real server can never send.
 */
describe('@ecm/contracts/testing', () => {
  it('builds customers the customer schema accepts', () => {
    for (const customer of [aCustomer(), anotherCustomer(), ...customersFrom(50)]) {
      expect(customerSchema.safeParse(customer).success).toBe(true);
    }
  });

  it('generates distinct records, the same ones every time', () => {
    const first = customersFrom(100);

    expect(new Set(first.map((customer) => customer.id)).size).toBe(100);
    expect(new Set(first.map((customer) => customer.email)).size).toBe(100);
    expect(customersFrom(100)).toEqual(first);
  });

  it('wraps a list in a page the page schema accepts', () => {
    const schema = pageResponseSchema(customerSchema);

    expect(schema.safeParse(aPage(customersFrom(3))).success).toBe(true);
  });

  it('builds create requests the server accepts, never twice with one email', () => {
    const first = aCreateCustomerRequest();
    const second = aCreateCustomerRequest({ status: 'ACTIVE', phone: '+84900000001' });

    expect(createCustomerRequestSchema.safeParse(first).success).toBe(true);
    expect(createCustomerRequestSchema.safeParse(second).success).toBe(true);
    expect(first.email).not.toBe(second.email);
  });
});
