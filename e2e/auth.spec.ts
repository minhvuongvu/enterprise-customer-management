import AxeBuilder from '@axe-core/playwright';
import { ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME } from '@ecm/contracts';
import type { BrowserContext, Page } from '@playwright/test';
import { anyCustomer, expect, signInAs, test } from './fixtures';

/**
 * Authentication and authorization, in a real browser against the real mock
 * API: real cookies, real CSRF, real refresh-token rotation.
 *
 * Every test here starts signed out and signs in as the role it is about.
 * The shared fixture signs in as ADMIN, who can do everything - which is
 * exactly the role that cannot show authorization working.
 */
test.use({ signIn: false });

/** Signs in through the form, the way a person does. */
async function signInThroughForm(page: Page, username: string): Promise<void> {
  // Prerendered, so the form is on screen before it is alive; the button is
  // enabled by hydration. See login-page.ts.
  const submit = page.getByRole('button', { name: 'Sign in' });
  await expect(submit).toBeEnabled();

  await page.getByLabel('Username').fill(username);
  // The mock does not verify passwords (docs/mock-backend.md); this is not a
  // credential.
  await page.getByLabel('Password').fill('not-verified-by-the-mock');
  await submit.click();
}

/**
 * Removes session cookies from the browser, the way time does.
 *
 * The browser drops an expired cookie by itself, so deleting it is an honest
 * stand-in for waiting fifteen minutes - and, unlike the mock's
 * `expired-session` scenario header, it needs no cooperation from the page.
 */
async function dropCookies(context: BrowserContext, names: readonly string[]): Promise<void> {
  const keep = (await context.cookies()).filter((cookie) => !names.includes(cookie.name));
  await context.clearCookies();
  await context.addCookies(keep);
}

test.describe('sign in, protected routes, permissions, sign out', () => {
  test('a manager signs in, can edit but not delete, and signs out', async ({
    page,
    context,
    baseURL,
  }) => {
    // --- signed out, the application is not reachable -------------------
    await page.goto('/customers');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcustomers$/);

    // --- sign in ----------------------------------------------------------
    await signInThroughForm(page, 'manager');
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByTestId('current-user')).toContainText('Morgan Manager');
    await expect(page.getByTestId('current-user')).toContainText('Manager');

    // --- permission-based UI ----------------------------------------------
    // A manager may create, so the action is offered.
    await expect(page.getByRole('link', { name: 'New customer' }).first()).toBeVisible();

    const customer = await anyCustomer(context.request, baseURL ?? '', 3);
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);

    // Edit is offered; delete is not - MANAGER holds CUSTOMER_UPDATE and not
    // CUSTOMER_DELETE. The positive assertion first, so the negative one is
    // about a rendered page and not an empty one.
    await expect(page.getByRole('link', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);

    // --- sign out -----------------------------------------------------------
    const cookiesBefore = await context.cookies();
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login$/);

    // Over on the server, not only in this tab. Put the old access cookie
    // back - as a copy taken before sign-out would be - and it is refused.
    await context.addCookies(cookiesBefore.filter((cookie) => cookie.name === ACCESS_COOKIE_NAME));
    const replayed = await context.request.get(`${baseURL}/api/customers?size=1`);
    expect(replayed.status()).toBe(401);
    await context.clearCookies();

    // And the application sends the user back to sign in.
    await page.goto(`/customers/${customer.id}`);
    await expect(page).toHaveURL(/\/login\?returnUrl=/);
  });

  test('a deep link survives having to sign in first', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'viewer');
    const customer = await anyCustomer(context.request, baseURL ?? '', 4);
    await context.clearCookies();

    await page.goto(`/customers/${customer.id}/audit`);
    await expect(page).toHaveURL(/\/login\?returnUrl=/);

    await signInThroughForm(page, 'viewer');

    // Back where the link pointed, not dumped on the list.
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}/audit$`));
  });

  test('a viewer can read, is offered nothing else, and is refused a write route', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'viewer');

    await page.goto('/customers');
    await expect(page.getByTestId('list-summary')).toBeVisible();
    await expect(page.getByRole('link', { name: 'New customer' })).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(0);

    // Typing the URL of a page the role does not allow: route authorization.
    await page.goto('/customers/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'You do not have access to this page',
    );
    // The address bar keeps the URL that was refused.
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test('the API refuses what the UI hides, with no UI involved', async ({ context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 5);
    const csrf = (await context.cookies()).find((cookie) => cookie.name === CSRF_COOKIE_NAME);

    // A manager who edits the bundle to show the delete button, or who calls
    // the API directly, gets the same answer: the server is the boundary.
    const response = await context.request.delete(`${baseURL}/api/customers/${customer.id}`, {
      headers: { 'x-csrf-token': csrf?.value ?? '' },
    });
    expect(response.status()).toBe(403);
  });

  test('the sign-in page has no detectable accessibility violations after a session ended', async ({
    page,
  }) => {
    await page.goto('/login?returnUrl=%2Fcustomers&reason=expired');
    await expect(page.getByTestId('session-expired')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('session expiry', () => {
  test('an expired access token is renewed without the user noticing', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'admin');
    await page.goto('/customers');
    await expect(page.getByTestId('list-summary')).toBeVisible();

    await dropCookies(context, [ACCESS_COOKIE_NAME]);

    const refreshes: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/auth/refresh')) {
        refreshes.push(request.url());
      }
    });

    // A reload asks who the user is, gets a 401, refreshes, and carries on.
    await page.reload();
    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByTestId('list-summary')).toBeVisible();
    expect(refreshes).toHaveLength(1);
  });

  test('a failed refresh sends the user to sign in, and back to where they were', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'admin');
    const customer = await anyCustomer(context.request, baseURL ?? '', 6);
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);

    // Both session cookies gone - the refresh token has expired too. The CSRF
    // cookie stays, so what fails is the refresh itself and not its CSRF check.
    await dropCookies(context, [ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME]);

    await page.getByTestId('refresh-detail').click();

    // Sent to sign in, told why, with the page they were on preserved.
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcustomers%2F[0-9a-f-]+&reason=expired$/);
    await expect(page.getByTestId('session-expired')).toBeVisible();

    await signInThroughForm(page, 'admin');
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);
  });
});
