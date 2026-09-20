import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  type Customer,
  type PageResponse,
} from '@ecm/contracts';

/**
 * The session every application test needs, and the helpers that let a test
 * arrange state the way a second user would.
 *
 * ## Why signing in is a fixture
 *
 * Every customer endpoint on the mock API is behind authentication, so from
 * Phase 2 onward a test that opens `/customers` without a session is testing
 * the error state. Signing in through the API rather than through the form
 * keeps that setup out of the assertions: the sign-in *form* is worth testing
 * once, in the journey test, not thirty times as a preamble.
 *
 * The request goes through the application's own origin, so the cookies it
 * sets are the cookies the browser will send - the same first-party
 * arrangement a deployment behind a reverse proxy produces.
 *
 * A test that needs to start signed out opts out:
 *
 *     test.use({ signIn: false });
 */

interface Options {
  /** Set to false for a test that must begin without a session. */
  signIn: boolean;
}

interface Fixtures {
  /** Runs before every test; nothing reads it. */
  session: void;
  /**
   * An API client that shares the browser's cookies.
   *
   * Playwright's own `request` fixture has its **own** cookie jar, so a test
   * that signed the browser in and then called it would be talking to the
   * server as a different, anonymous client - and would get a 401 that looks
   * like an application bug. `context.request` is the one that shares.
   */
  api: APIRequestContext;
}

export const test = base.extend<Options & Fixtures>({
  signIn: [true, { option: true }],

  api: async ({ context }, use) => {
    await use(context.request);
  },

  session: [
    async ({ context, baseURL, signIn }, use) => {
      if (signIn) {
        await signInAs(context, baseURL ?? '', 'admin');
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Establishes a session in the browser context.
 *
 * `context.request` shares the cookie jar with the pages in that context, so
 * the cookies set here are the ones the application will send.
 */
export async function signInAs(
  context: BrowserContext,
  baseURL: string,
  username: string,
): Promise<void> {
  const response = await context.request.post(`${baseURL}/api/auth/login`, {
    // The mock backend does not verify passwords - see docs/mock-backend.md -
    // so there is no credential here to keep out of the repository.
    data: { username, password: 'not-verified-by-the-mock' },
  });
  expect(response.ok(), `sign-in failed with ${response.status()}`).toBe(true);
}

/**
 * A real customer from the seeded dataset.
 *
 * Tests need an identifier that exists. Inventing one would exercise the
 * not-found path on every test that meant to exercise something else, and
 * hard-coding one would tie the suite to a seed it does not control.
 *
 * `position` picks a different record per test. The suite runs in parallel
 * against one server, so two tests that both took "the first customer" and one
 * of them wrote to it would fail each other intermittently - the worst kind of
 * failure, because it looks like a bug in the application.
 */
export async function anyCustomer(
  request: APIRequestContext,
  baseURL: string,
  position = 1,
): Promise<Customer> {
  const response = await request.get(
    `${baseURL}/api/customers?page=${position}&size=1&sort=customerCode,asc`,
  );
  expect(response.ok(), `listing customers failed with ${response.status()}`).toBe(true);

  const page = (await response.json()) as PageResponse<Customer>;
  expect(page.items.length).toBeGreaterThan(0);
  return page.items[0];
}

/**
 * Changes a customer from outside the browser - the second user.
 *
 * This is what makes the 409 path reachable honestly: the record really is
 * modified while a form is open on it, rather than the server being asked to
 * pretend. The CSRF token is read from the context's cookies and echoed,
 * exactly as the application's own interceptor does.
 */
export async function updateCustomerOutOfBand(
  context: BrowserContext,
  baseURL: string,
  customer: Customer,
  changes: Record<string, unknown>,
): Promise<void> {
  const cookies = await context.cookies();
  const csrf = cookies.find((cookie) => cookie.name === CSRF_COOKIE_NAME)?.value ?? '';

  const response = await context.request.patch(`${baseURL}/api/customers/${customer.id}`, {
    headers: { [CSRF_HEADER_NAME]: csrf },
    data: { ...changes, version: customer.version },
  });
  expect(response.ok(), `out-of-band update failed with ${response.status()}`).toBe(true);
}
