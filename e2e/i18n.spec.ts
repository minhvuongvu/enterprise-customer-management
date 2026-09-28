import type { APIRequestContext, Browser } from '@playwright/test';
import type { Customer, PageResponse } from '@ecm/contracts';
import { expect, signInAs, test } from './fixtures';

/**
 * Internationalisation, end to end.
 *
 * Unit tests prove that the formatters format. These prove the three things
 * only a real browser can: that switching language changes the whole page
 * without a reload, that the choice survives one, and that a date of birth
 * reads the same in every time zone - the browser's time zone is a property
 * of the context here, not something a test can fake in jsdom.
 */

/** Reads a marker that only survives if the page was never reloaded. */
async function markPage(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { ecmNoReload: boolean }).ecmNoReload = true;
  });
}
async function wasReloaded(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => !(window as unknown as { ecmNoReload?: boolean }).ecmNoReload);
}

async function chooseLanguage(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByTestId('language-switcher').getByRole('button').click();
  await page.getByRole('menuitemradio', { name }).click();
}

test.describe('switching language', () => {
  test('changes every string, the document language and the title, without a reload', async ({
    page,
  }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await markPage(page);

    await chooseLanguage(page, 'Tiếng Việt');

    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page).toHaveTitle(/Quản lý khách hàng/);
    // Navigation, table headers and the summary all follow, not just the page.
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Họ và tên/ })).toBeVisible();
    expect(await wasReloaded(page)).toBe(false);
  });

  test('formats numbers for the language: grouping follows the locale', async ({ page }) => {
    await page.goto('/customers');
    const summary = page.getByTestId('list-summary');
    // 50,000 customers in the seed: "of 50,000 customers" in English...
    await expect(summary).toHaveText(/of \d{1,3}(,\d{3})+ customers\./);

    await chooseLanguage(page, 'Tiếng Việt');

    // ...and "trên 50.000 khách hàng" in Vietnamese, where the dot groups.
    await expect(summary).toHaveText(/trên \d{1,3}(\.\d{3})+ khách hàng\./);
  });

  test('is remembered across a reload, and can be switched back', async ({ page }) => {
    await page.goto('/customers');
    await chooseLanguage(page, 'Tiếng Việt');
    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();

    await chooseLanguage(page, 'English');
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('marks each language name with its own language', async ({ page }) => {
    await page.goto('/customers');
    await page.getByTestId('language-switcher').getByRole('button').click();

    // A screen reader reads "Tiếng Việt" with a Vietnamese voice only if told.
    await expect(page.getByRole('menuitemradio', { name: 'Tiếng Việt' })).toHaveAttribute(
      'lang',
      'vi',
    );
    await expect(page.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test.describe('on the prerendered sign-in page', () => {
    test.use({ signIn: false });

    test('the stored language replaces the prerendered English once the app starts', async ({
      page,
    }) => {
      await page.addInitScript(() => localStorage.setItem('ecm.language', 'vi'));
      await page.goto('/login');

      await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
      await expect(page.getByLabel('Tên đăng nhập')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
    });
  });
});

/**
 * A customer with a date of birth, found through the API rather than assumed:
 * the seed decides which customers have one. Taken from far down a stable
 * ordering - the other specs use the first few dozen records by code, and
 * their writes must not change which record this finds.
 */
async function customerWithBirthday(api: APIRequestContext, baseURL: string, page: number) {
  const response = await api.get(
    `${baseURL}/api/customers?page=${page}&size=50&sort=customerCode,asc`,
  );
  const body = (await response.json()) as PageResponse<Customer>;
  const found = body.items.find((customer) => customer.dateOfBirth !== null);
  expect(found, 'a customer with a date of birth').toBeDefined();
  return found as Customer;
}

/** What the date of birth must read as, whatever the zone: the calendar date itself. */
function expectedBirthday(dateOfBirth: string): string {
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function detailInZone(browser: Browser, baseURL: string, timezoneId: string, id: string) {
  const context = await browser.newContext({ timezoneId, baseURL });
  await signInAs(context, baseURL, 'admin');
  const page = await context.newPage();
  await page.goto(`/customers/${id}`);
  const birthday = (await page.getByTestId('date-of-birth').textContent())?.trim() ?? '';
  const created = (await page.locator('time').last().textContent())?.trim() ?? '';
  await context.close();
  return { birthday, created };
}

test.describe('the time policy', () => {
  // Pago Pago is UTC-11 and Kiritimati UTC+14: the same instant is on
  // different calendar days in them, which is what moves a date that has been
  // mistaken for a moment.
  const ZONES = [
    'Pacific/Pago_Pago',
    'America/Los_Angeles',
    'Asia/Ho_Chi_Minh',
    'Pacific/Kiritimati',
  ];

  test('a date of birth reads the same in every time zone; an instant does not', async ({
    browser,
    api,
    baseURL,
  }) => {
    const customer = await customerWithBirthday(api, baseURL ?? '', 300);
    const expected = expectedBirthday(customer.dateOfBirth ?? '');

    const seen = [];
    for (const zone of ZONES) {
      seen.push(await detailInZone(browser, baseURL ?? '', zone, customer.id));
    }

    for (const view of seen) {
      expect(view.birthday).toBe(expected);
    }
    // The control: the zones really were different. An instant 25 hours
    // apart cannot read the same at both ends of the day.
    expect(seen[0].created).not.toBe(seen[seen.length - 1].created);
  });

  test('saving a customer from a zone west of Greenwich does not move their birthday', async ({
    browser,
    api,
    baseURL,
  }) => {
    const customer = await customerWithBirthday(api, baseURL ?? '', 301);
    const context = await browser.newContext({ timezoneId: 'Pacific/Pago_Pago', baseURL });
    await signInAs(context, baseURL ?? '', 'admin');
    const page = await context.newPage();

    await page.goto(`/customers/${customer.id}/edit`);
    const birthday = page.getByLabel('Date of birth');
    // The date field shows the stored calendar date, not the previous evening.
    await expect(birthday).toHaveValue(customer.dateOfBirth ?? '');

    await page.getByLabel(/Full name/).fill(`${customer.fullName} (zone test)`);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));

    const saved = (await (
      await context.request.get(`${baseURL}/api/customers/${customer.id}`)
    ).json()) as Customer;
    expect(saved.dateOfBirth).toBe(customer.dateOfBirth);
    await context.close();
  });
});

test.describe('the locale lab', () => {
  test('writes one amount by each language rule, and keeps its currency', async ({ page }) => {
    await page.goto('/technical-labs/locale');
    await expect(page.getByTestId('locale-currency-USD')).toHaveText('$1,234,567.89');
    await expect(page.getByTestId('locale-plural-1')).toHaveText('1 customer selected');
    await expect(page.getByTestId('locale-plural-2')).toHaveText('2 customers selected');

    await chooseLanguage(page, 'Tiếng Việt');

    await expect(page.getByTestId('locale-number')).toHaveText('1.234.567,891');
    await expect(page.getByTestId('locale-currency-USD')).toContainText('1.234.567,89');
    await expect(page.getByTestId('locale-currency-USD')).toContainText('US$');
    await expect(page.getByTestId('locale-currency-VND')).toContainText('1.234.568');
    await expect(page.getByTestId('locale-plural-1')).toHaveText('Đã chọn 1 khách hàng');
  });

  test.describe('in a zone west of Greenwich', () => {
    test.use({ timezoneId: 'America/Los_Angeles' });

    test('shows the naive date moving, and the date-only one not', async ({ page }) => {
      await page.goto('/technical-labs/locale');
      const row = page.getByTestId('zone-America/Los_Angeles');
      await expect(row).toContainText('December 31, 1989');
      await expect(row.getByTestId('zone-birthday')).toHaveText('January 1, 1990');
    });
  });
});
