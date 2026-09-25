import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { anyCustomer, expect, signInAs, test, updateCustomerOutOfBand } from './fixtures';

/**
 * Phase 4, in a real browser against the real mock API: realtime news between
 * two users, the notification centre, reconnection, an optimistic update and
 * its rollback, the avatar upload, CSV import and export, and the audit trail.
 *
 * The page under test belongs to MANAGER - "user B". Changes arrive from a
 * second browser context signed in as ADMIN - "user A" - because the realtime
 * client rightly ignores a user's own changes.
 *
 * Each test takes its own records (positions 20 and up): the suite runs in
 * parallel against one dataset.
 */
test.use({ signIn: false });

/** A 1x1 PNG, so uploads carry real image bytes that pass the server's signature check. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function userA(browser: Browser, baseURL: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  await signInAs(context, baseURL, 'admin');
  return context;
}

/**
 * The notification-centre entries about one customer.
 *
 * Scoped to a customer code because the suite runs in parallel: other tests
 * change other customers at the same time, and user B is - correctly - told
 * about those too. Counting every notification would test the schedule.
 */
async function entriesAbout(page: Page, code: string) {
  const panel = page.getByTestId('notification-panel');
  if (!(await panel.isVisible())) {
    await page.getByTestId('notification-bell').click();
  }
  return panel.getByTestId('notification-entry').filter({ hasText: code });
}

/** Waits until the page's live-update stream is connected. */
async function live(page: Page): Promise<void> {
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-state', 'open');
}

test.describe('realtime: user A changes a customer, user B is told', () => {
  test('B sees the news, the record is flagged not replaced, and one click brings it current', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 20);
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);
    await live(page);

    const a = await userA(browser, baseURL ?? '');
    const renamed = `${customer.fullName} (renamed by A)`;
    await updateCustomerOutOfBand(a, baseURL ?? '', customer, { fullName: renamed });

    // "Customer C-000020 was updated by another user."
    await expect(page.getByTestId('toasts')).toContainText(
      `Customer ${customer.customerCode} was updated by another user.`,
    );
    // The record is not changed under the reader; it says it may be stale.
    await expect(page.getByTestId('stale-record')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);

    await page.getByTestId('stale-refresh').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(renamed);
    await expect(page.getByTestId('stale-record')).toHaveCount(0);

    // The notification centre kept it: unread, then read.
    await expect(page.getByTestId('unread-count')).toBeVisible();
    const entry = await entriesAbout(page, customer.customerCode);
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('Unread');
    const axe = await new AxeBuilder({ page })
      .include('[data-testid="notification-panel"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
    await page.getByTestId('mark-all-read').click();
    await expect(entry).not.toContainText('Unread');

    await a.close();
  });

  test('an event delivered twice is shown once', async ({
    page,
    context,
    browser,
    baseURL,
    request,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 21);
    await page.goto('/customers');
    await live(page);

    const a = await userA(browser, baseURL ?? '');
    await updateCustomerOutOfBand(a, baseURL ?? '', customer, {
      fullName: `${customer.fullName}.`,
    });
    const entries = await entriesAbout(page, customer.customerCode);
    await expect(entries).toHaveCount(1);

    // The server re-delivers the same event, with the same id - what a replay
    // after a reconnect does.
    const duplicated = await request.post(`${baseURL}/api/_mock/events/duplicate`, {
      data: { customerId: customer.id },
    });
    expect(duplicated.status()).toBe(202);

    // Give it every chance to arrive and be (wrongly) counted.
    await page.waitForTimeout(750);
    await expect(entries).toHaveCount(1);
    await a.close();
  });

  test('the stream reconnects after the server drops it, and news still arrives', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 22);
    await page.goto('/customers');
    await live(page);

    // What a proxy timeout or a deploy looks like to the browser.
    await context.request.post(`${baseURL}/api/_mock/events/disconnect`);

    await expect(page.getByTestId('connection-status')).toHaveAttribute(
      'data-state',
      'reconnecting',
    );
    await live(page);

    const a = await userA(browser, baseURL ?? '');
    await updateCustomerOutOfBand(a, baseURL ?? '', customer, {
      fullName: `${customer.fullName}!`,
    });
    await expect(await entriesAbout(page, customer.customerCode)).toHaveCount(1);
    await a.close();
  });
});

test.describe('optimistic status change', () => {
  test('shows the change at once and rolls it back when the server refuses', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 23);
    await page.goto(`/customers/${customer.id}`);
    const badge = page.getByTestId('status-badge');
    const before = (await badge.textContent())?.trim() ?? '';

    // Hold the write until the optimistic state has been seen, then fail it.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/customers/${customer.id}`, async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      await held;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'x', correlationId: 'e2e' },
        }),
      });
    });

    await page.getByTestId('toggle-status').click();
    await expect(badge).not.toHaveText(before);

    release();
    // Rolled back, and said so - loudly, because what the user saw did not happen.
    await expect(badge).toHaveText(before);
    await expect(page.getByTestId('alerts')).toContainText('The status change was undone.');
  });

  test('keeps the change when the server accepts it', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 24);
    await page.goto(`/customers/${customer.id}`);

    const target = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await page.getByTestId('toggle-status').click();
    await expect(page.getByTestId('status-badge')).toHaveText(
      target === 'ACTIVE' ? 'Active' : 'Inactive',
    );

    await expect
      .poll(async () => {
        const response = await context.request.get(`${baseURL}/api/customers/${customer.id}`);
        return ((await response.json()) as { status: string }).status;
      })
      .toBe(target);
  });
});

test.describe('avatar upload', () => {
  test('choose, preview, upload with progress, and see the new picture', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 25);
    await page.goto(`/customers/${customer.id}`);

    await page
      .getByTestId('file-input')
      .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByTestId('avatar-preview')).toBeVisible();

    await page.getByTestId('avatar-upload').click();
    await expect(page.getByTestId('toasts')).toContainText('Picture updated.');
    await expect(page.getByTestId('avatar-current')).toBeVisible();
  });

  test('cancel aborts the request, and the page stays usable meanwhile', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 26);
    await page.goto(`/customers/${customer.id}`);

    // An upload that never finishes on its own.
    await page.route('**/avatar', () => undefined);
    const aborted = page.waitForEvent('requestfailed', (request) =>
      request.url().endsWith('/avatar'),
    );

    await page
      .getByTestId('file-input')
      .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('avatar-upload').click();
    await expect(page.getByTestId('avatar-progress')).toBeVisible();

    // Not blocked: another action on the page still works during the upload.
    await page.getByTestId('refresh-detail').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);

    await page.getByTestId('avatar-cancel').click();
    await aborted;
    await expect(page.getByTestId('avatar-upload')).toBeVisible();
  });

  test('a file the policy refuses is refused in the browser, before it is sent', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 27);
    await page.goto(`/customers/${customer.id}`);

    let sent = false;
    page.on('request', (request) => (sent ||= request.url().endsWith('/avatar')));

    await page.getByTestId('file-input').setInputFiles({
      name: 'drawing.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    });
    await expect(page.getByTestId('avatar-invalid')).toContainText('not accepted');
    expect(sent).toBe(false);
  });
});

test.describe('import and export', () => {
  test('preview, confirm, partial success, and a downloadable report of the skipped rows', async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    await page.goto('/customers');
    await page.getByRole('link', { name: 'Import CSV' }).click();
    await expect(page).toHaveURL(/\/customers\/import$/);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const csv = [
      'fullName,email,status',
      `Imported One,import-one-${stamp}@example.test,PROSPECT`,
      'Imported Bad,not-an-email,PROSPECT',
      `Imported Two,import-two-${stamp}@example.test,PROSPECT`,
    ].join('\n');

    await page
      .getByTestId('file-input')
      .setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

    await expect(page.getByTestId('preview-summary')).toHaveText(
      '3 rows: 2 will be imported, 1 will be skipped.',
    );
    await expect(page.getByTestId('import-errors')).toContainText('Row 3, email');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);

    await page.getByTestId('confirm-import').click();
    await expect(page.getByTestId('result-summary')).toHaveText(
      '2 customers imported, 1 rows skipped.',
    );

    const download = page.waitForEvent('download');
    await page.getByTestId('download-errors').click();
    expect((await download).suggestedFilename()).toBe('import-errors.csv');
  });

  test('exports the filtered list as a CSV download', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    await page.goto('/customers?status=INACTIVE');
    await expect(page.getByTestId('list-summary')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByTestId('export').click();
    const file = await download;

    expect(file.suggestedFilename()).toBe('customers.csv');
    await expect(page.getByTestId('toasts')).toContainText('Export downloaded.');
  });

  test('a viewer is offered neither import nor export', async ({ page, context, baseURL }) => {
    await signInAs(context, baseURL ?? '', 'viewer');
    await page.goto('/customers');
    await expect(page.getByTestId('list-summary')).toBeVisible();

    await expect(page.getByTestId('export')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Import CSV' })).toHaveCount(0);
  });
});

test.describe('audit trail', () => {
  test('shows who changed what, and withholds the value of a sensitive field', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await signInAs(context, baseURL ?? '', 'manager');
    const customer = await anyCustomer(context.request, baseURL ?? '', 28);

    const a = await userA(browser, baseURL ?? '');
    await updateCustomerOutOfBand(a, baseURL ?? '', customer, {
      fullName: `${customer.fullName} (audited)`,
      dateOfBirth: '1980-05-06',
    });
    await a.close();

    await page.goto(`/customers/${customer.id}/audit`);
    const entries = page.getByTestId('audit-entries');
    await expect(entries).toContainText('Avery Admin');
    await expect(entries).toContainText('Full name');
    await expect(entries).toContainText(`${customer.fullName} (audited)`);
    await expect(entries).toContainText('Date of birth');
    await expect(entries).toContainText('Changed (value not shown)');
    // Not on the page, and not in anything the page received.
    await expect(entries).not.toContainText('1980-05-06');
  });
});
