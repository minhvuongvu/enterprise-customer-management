import { anyCustomer, expect, test } from './fixtures';

/**
 * Routing as a user experiences it: deep links, the back button, and state
 * that lives in the URL.
 *
 * These are the properties that are cheap to have from the start and very
 * expensive to add once list state has settled into component fields. Phase 1
 * established them against placeholder pages; Phase 2 re-established them
 * against real data, which is the version that actually matters.
 */

test.describe('navigation', () => {
  test('a deep link lands where it says, with no intermediate page', async ({
    page,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 3);
    await page.goto(`/customers/${customer.id}/edit`);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit customer');
    // The form arrives filled from the record the URL names, not from
    // anything carried in navigation state.
    await expect(page.getByLabel('Full name')).toHaveValue(customer.fullName);
  });

  test('the breadcrumb trail reflects the route tree and links back up', async ({
    page,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 4);
    await page.goto(`/customers/${customer.id}/audit`);

    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail).toContainText('Customers');
    await expect(trail).toContainText('Audit');

    await trail.getByRole('link', { name: 'Customer', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));
  });

  test('list state lives in the URL, so it is linkable and reloadable', async ({ page }) => {
    await page.goto('/customers?page=3&size=10&status=ACTIVE&sort=fullName,asc');

    await expect(page.getByTestId('list-summary')).toContainText('Showing 10 of');
    // `exact` because Playwright matches accessible names by substring, and
    // with 3,113 pages of results "Go to page 3" also matches "Go to page 3113".
    await expect(page.getByRole('button', { name: 'Go to page 3', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // The filter and the sort are restored too, not just the page.
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('ACTIVE');
    await expect(page.getByRole('columnheader', { name: 'Full name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  test('an invalid filter in the URL is ignored rather than sent to the server', async ({
    page,
  }) => {
    await page.goto('/customers?status=DELETED&sort=password,asc');

    // A hand-edited or truncated URL renders the unfiltered list.
    await expect(page.getByTestId('list-summary')).toBeVisible();
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('');
  });

  test('paging changes the URL, keeps the other parameters, and the back button works', async ({
    page,
  }) => {
    // "smith" rather than a Vietnamese name: the mock's search index is a
    // plain lowercase substring match, so an unaccented query would not find
    // an accented record. Searching without diacritics is a real requirement,
    // and it is Phase 6's - noted there rather than worked around here.
    await page.goto('/customers?search=smith');
    await expect(page.getByTestId('list-summary')).toBeVisible();

    // Page 2, not an arbitrary number: the paginator windows its list, so on
    // page 1 the only numbered neighbours rendered are 2 and the last page.
    await page.getByRole('button', { name: 'Go to page 2' }).click();
    await expect(page).toHaveURL(/page=2/);
    // Merged, not replaced: losing the search term on every page change is
    // the classic version of this bug.
    await expect(page).toHaveURL(/search=smith/);

    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/search=smith/);
  });

  test('the active navigation entry is marked as the current page', async ({
    page,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 5);
    await page.goto(`/customers/${customer.id}`);

    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Customers' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('a customer that does not exist is answered, not left blank', async ({ page }) => {
    await page.goto('/customers/00000000-0000-4000-8000-000000000000');

    await expect(page.getByTestId('detail-not-found')).toBeVisible();
  });

  test('the technical labs area is reachable and its placeholders say what they are', async ({
    page,
  }) => {
    await page.goto('/technical-labs');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Technical labs');

    await page.getByRole('link', { name: /Offline and connectivity/ }).click();
    await expect(page).toHaveURL(/\/technical-labs\/offline$/);
    await expect(page.getByRole('heading', { name: 'Not built yet' })).toBeVisible();
  });

  test('an unknown lab is a broken link, not a blank page', async ({ page }) => {
    await page.goto('/technical-labs/does-not-exist');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unknown lab');
  });
});
