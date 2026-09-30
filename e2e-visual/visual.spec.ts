import type { Locator, Page } from '@playwright/test';
import { anyCustomer, expect, test } from '../e2e/fixtures';

/**
 * Visual regression, selectively (playwright.visual.config.ts).
 *
 * Two groups, and nothing else:
 *
 *  - **Critical pages**, whole viewport: sign-in (the first thing anyone
 *    sees), the customer list on desktop and phone, the customer record, the
 *    form with errors - in light and dark, and in Vietnamese where the longer
 *    words change the layout.
 *  - **Design-system components in their states**, cropped to the component:
 *    dialog, menu with a checked choice, empty state, pagination, button
 *    variants, field errors. A crop fails only when the component changed,
 *    not when the page around it did.
 *
 * What changes by itself is masked: the connection indicator (live realtime
 * state). Everything else is fixed by the seed, UTC and `en-US`.
 */

/** A record no other visual test writes to - and this suite writes to none. */
const CUSTOMER_POSITION = 7;

async function settle(page: Page): Promise<void> {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('app-skeleton')).toHaveCount(0);
  // Web fonts and images finished, so a late paint is not in the picture.
  await page.evaluate(() => document.fonts.ready);
}

function volatile(page: Page): Locator[] {
  return [page.locator('app-connection-status')];
}

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
}

async function useLanguage(page: Page, language: 'en' | 'vi'): Promise<void> {
  await page.addInitScript((code) => localStorage.setItem('ecm.language', code), language);
}

test.describe('critical pages', () => {
  test.describe('signed out', () => {
    test.use({ signIn: false });

    for (const theme of ['light', 'dark'] as const) {
      test(`sign-in, ${theme}`, async ({ page }) => {
        await useTheme(page, theme);
        await page.goto('/login');
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
        await settle(page);

        await expect(page).toHaveScreenshot(`sign-in-${theme}.png`);
      });
    }

    test('sign-in, Vietnamese', async ({ page }) => {
      await useLanguage(page, 'vi');
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
      await settle(page);

      await expect(page).toHaveScreenshot('sign-in-vi.png');
    });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`customer list, desktop, ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/customers?sort=customerCode,asc');
      await expect(page.locator('table tbody tr')).toHaveCount(20);
      await settle(page);

      await expect(page).toHaveScreenshot(`customer-list-desktop-${theme}.png`, {
        mask: volatile(page),
      });
    });
  }

  test('customer list, phone, Vietnamese', async ({ page }) => {
    await useLanguage(page, 'vi');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/customers?sort=customerCode,asc');
    await expect(page.getByTestId('customer-card').first()).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot('customer-list-phone-vi.png', { mask: volatile(page) });
  });

  test('customer record', async ({ page, api, baseURL }) => {
    const customer = await anyCustomer(api, baseURL ?? '', CUSTOMER_POSITION);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByTestId('customer-facts')).toBeVisible();
    await settle(page);

    await expect(page).toHaveScreenshot('customer-record.png', { mask: volatile(page) });
  });

  test('customer form with every kind of error', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/customers/new');
    await page.getByLabel('Email').fill('not an email');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByLabel('Full name')).toBeFocused();
    await settle(page);

    await expect(page).toHaveScreenshot('customer-form-errors.png', {
      fullPage: true,
      mask: volatile(page),
    });
  });
});

test.describe('design-system components', () => {
  test('dialog: a destructive confirmation', async ({ page, api, baseURL }) => {
    const customer = await anyCustomer(api, baseURL ?? '', CUSTOMER_POSITION);
    await page.goto(`/customers/${customer.id}`);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog).toHaveScreenshot('dialog-danger.png');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`menu: a choice, checked, ${theme}`, async ({ page }) => {
      await useTheme(page, theme);
      await page.goto('/customers');
      await page.getByRole('button', { name: 'Colour theme' }).click();
      const menu = page.getByRole('menu');
      await expect(menu.getByRole('menuitemradio', { checked: true })).toBeVisible();

      await expect(menu).toHaveScreenshot(`menu-choice-${theme}.png`);
    });
  }

  test('empty state: a search with no match', async ({ page }) => {
    await page.goto('/customers?search=zzzz-no-such-customer');
    const empty = page.locator('app-empty-state');
    await expect(empty).toBeVisible();

    await expect(empty).toHaveScreenshot('empty-state.png');
  });

  test('pagination: a middle page', async ({ page }) => {
    await page.goto('/customers?page=5&sort=customerCode,asc');
    const pagination = page.getByRole('navigation', { name: 'Pages' });
    await expect(
      pagination.getByRole('button', { name: 'Go to page 5', exact: true }),
    ).toHaveAttribute('aria-current', 'page');

    await expect(pagination).toHaveScreenshot('pagination.png');
  });

  test('page actions: every button variant', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/customers');
    const actions = page.locator('app-page-header');
    await expect(actions.getByRole('link', { name: 'New customer' })).toBeVisible();

    await expect(actions).toHaveScreenshot('page-header-actions.png');
  });
});
