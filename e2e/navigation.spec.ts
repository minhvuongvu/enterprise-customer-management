import { expect, test } from '@playwright/test';

/**
 * Routing as a user experiences it: deep links, the back button, and state
 * that lives in the URL.
 *
 * These are the properties that are cheap to have from the start and very
 * expensive to add once list state has settled into component fields - which
 * is why they are tested in Phase 1, before there is a list.
 */

test.describe('navigation', () => {
  test('a deep link lands where it says, with no intermediate page', async ({ page }) => {
    await page.goto('/customers/c-000042/edit');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit customer');
    // The mode comes from route metadata, not from guessing at the URL shape.
    await expect(page.getByTestId('form-mode')).toContainText('edit mode');
  });

  test('the breadcrumb trail reflects the route tree and links back up', async ({ page }) => {
    await page.goto('/customers/c-000042/audit');

    const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(trail).toContainText('Customers');
    await expect(trail).toContainText('Audit');

    await trail.getByRole('link', { name: 'Customer', exact: true }).click();
    await expect(page).toHaveURL(/\/customers\/c-000042$/);
  });

  test('list state lives in the URL, so it is linkable and reloadable', async ({ page }) => {
    await page.goto('/customers?page=3&size=50&search=nguyen');

    await expect(page.getByTestId('list-url-state')).toContainText('page 3');
    await expect(page.getByTestId('list-url-state')).toContainText('50 rows');
    await expect(page.getByTestId('list-search')).toContainText('nguyen');
  });

  test('paging changes the URL, keeps the other parameters, and the back button works', async ({
    page,
  }) => {
    await page.goto('/customers?search=nguyen');

    // Page 2, not an arbitrary number: the paginator windows its list, so on
    // page 1 the only numbered neighbours rendered are 2 and the last page.
    await page.getByRole('button', { name: 'Go to page 2' }).click();
    await expect(page).toHaveURL(/page=2/);
    // Merged, not replaced: losing the search term on every page change is
    // the classic version of this bug.
    await expect(page).toHaveURL(/search=nguyen/);

    await page.goBack();
    await expect(page).not.toHaveURL(/page=2/);
    await expect(page).toHaveURL(/search=nguyen/);
  });

  test('the current page is marked for screen readers, not only coloured', async ({ page }) => {
    await page.goto('/customers?page=2');

    await expect(page.getByRole('button', { name: 'Go to page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('the active navigation entry is marked as the current page', async ({ page }) => {
    await page.goto('/customers/c-000042');

    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Customers' }),
    ).toHaveAttribute('aria-current', 'page');
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
