/**
 * @ecm/contracts/testing - test data for both apps' tests (docs/testing-strategy.md, "Mocking").
 *
 * Why here: the browser's unit tests, the mock API's tests and the labs'
 * tests all need customers, and each used to write its own. A customer typed
 * three times is three records that drift from the schema at three different
 * speeds. One set of builders, next to the schema they must satisfy - and
 * `test/fixtures.spec.ts` parses every one of them through that schema, so a
 * fixture that stops being valid fails there, not in some distant test.
 *
 * A separate entry point, never exported from `@ecm/contracts` itself, so it
 * cannot reach an application bundle; lint/architecture.ts refuses it outside
 * test code, and perf/check-budgets.ts would find it in the bundle.
 *
 * Deterministic: no `Math.random()`, no `Date.now()`. `customersFrom(n)`
 * *generates* as many records as a test needs, all derived from their index.
 */
export * from './customers.js';
