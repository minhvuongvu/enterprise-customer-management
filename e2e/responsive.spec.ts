import type { Page } from '@playwright/test';
import { anyCustomer, expect, test } from './fixtures';

/**
 * Adaptive layouts: the UI changes shape at each width, not just size.
 *
 * layout.spec.ts covers the shell - sidebar, rail, drawer. This file covers
 * what Phase 6 adapted inside it, and the one property every page must hold
 * at every width: the document never scrolls sideways. A page that does has
 * a control somewhere off to the right that a phone user will never find.
 */

const WIDTHS = [
  { name: 'phone', width: 375, height: 800 },
  { name: 'tablet', width: 820, height: 1000 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

const ROUTES = [
  '/customers',
  '/customers/new',
  '/customers/:id',
  '/customers/:id/edit',
  '/customers/:id/audit',
  '/customers/import',
  '/technical-labs',
  '/technical-labs/locale',
  '/technical-labs/performance',
];

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

for (const size of WIDTHS) {
  test.describe(`at ${size.name} width (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page, api, baseURL }) => {
        const customer = route.includes(':id') ? await anyCustomer(api, baseURL ?? '', 44) : null;
        await page.goto(customer ? route.replace(':id', customer.id) : route);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });

        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
  });
}

test.describe('the customer list on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('is a list of cards, not a table squeezed into the screen', async ({ page }) => {
    await page.goto('/customers');

    await expect(page.getByTestId('customer-card').first()).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    // A list, announced as one, with every value labelled in place.
    const list = page.getByRole('list', { name: /^Customers, with/ });
    await expect(list.getByRole('listitem').first()).toContainText('Code');
  });

  test('sorts through a labelled select, since there are no column headers', async ({ page }) => {
    await page.goto('/customers');
    await page.getByLabel('Sort by').selectOption({ label: 'Full name, ascending' });

    await expect(page).toHaveURL(/sort=fullName%2Casc|sort=fullName,asc/);
  });

  test('selects a card with its own named checkbox and opens the bulk bar', async ({ page }) => {
    await page.goto('/customers');
    const first = page.getByTestId('customer-card').first();
    const name = (await first.getByRole('link').textContent())?.trim() ?? '';

    await first.getByRole('checkbox', { name: `Select ${name}` }).check();

    await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  });

  test('folds the secondary filters away, and says when some are in effect', async ({ page }) => {
    await page.goto('/customers?status=ACTIVE');

    const toggle = page.getByTestId('filters-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toContainText('1 active');
    await expect(page.getByLabel('Search', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Status', { exact: true })).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Folding kept the value: nothing the user chose is lost by hiding it.
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('ACTIVE');
  });

  test('keeps the primary action and moves the rest into a menu', async ({ page }) => {
    await page.goto('/customers');

    await expect(page.getByRole('link', { name: 'New customer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);

    await page.getByTestId('more-actions').getByRole('button').click();
    await expect(page.getByRole('menuitem', { name: 'Export CSV' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Import CSV' }).click();
    await expect(page).toHaveURL(/\/customers\/import$/);
  });

  test('moves the account and preferences into the drawer, out of a crowded header', async ({
    page,
  }) => {
    await page.goto('/customers');
    const header = page.locator('app-header');
    await expect(header.getByRole('button', { name: /Language/ })).toHaveCount(0);
    await expect(header.getByTestId('sign-out')).toHaveCount(0);

    await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation menu' });
    await expect(drawer.getByRole('region', { name: 'Account and preferences' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /Language/ })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Colour theme' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('locks the page behind the open drawer', async ({ page }) => {
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible();

    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
  });
});

test.describe('dialogs', () => {
  test('lock the page behind them while open, and release it on close', async ({
    page,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 45);
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto(`/customers/${customer.id}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await expect(page.locator('html')).toHaveClass(/cdk-global-scrollblock/);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
  });

  test('sit at the bottom of a phone screen, where a thumb reaches', async ({
    page,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 46);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/customers/${customer.id}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    const box = await page.getByRole('dialog').boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(800);
    expect(Math.round(box?.width ?? 0)).toBe(375);
  });
});
