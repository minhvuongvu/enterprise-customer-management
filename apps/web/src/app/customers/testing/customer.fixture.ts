/**
 * Customers for the customer feature's tests.
 *
 * The builders themselves live in `@ecm/contracts/testing`, next to the
 * schema they must satisfy, and shared with the mock API's and the labs'
 * tests (docs/testing-strategy.md, "Mocking"). This file stays as the
 * feature's import point, so thirty-odd specs did not have to change when
 * the builders moved.
 *
 * Test-only: nothing in the application imports this file, and
 * lint/architecture.ts fails the build if anything does.
 */
export { aCustomer, anotherCustomer, aPage, customersFrom } from '@ecm/contracts/testing';
