import { anyCustomer, expect, test, updateCustomerOutOfBand } from './fixtures';

/**
 * The customer journey, against the real mock backend.
 *
 * This is the test the Phase 2 prompt asks for - sign in, list, search,
 * detail, edit, save, delete - plus the two paths that only exist because
 * there is a real server underneath: a bulk action that partly fails, and a
 * write that loses a race with someone else.
 *
 * Nothing is stubbed. The records come from the seeded dataset, the writes
 * really happen, and the assertions are what a person would see.
 */

/** A name unlikely to collide with the 50,000 seeded records. */
function uniqueName(): string {
  return `E2E Customer ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.test`;
}

test.describe('the customer journey', () => {
  // This one starts signed out on purpose: the sign-in form is part of the
  // journey, and testing it once here is worth more than a fixture that
  // quietly bypasses it everywhere.
  test.use({ signIn: false });

  test('sign in, find, open, edit, save, delete', async ({ page }) => {
    await page.goto('/login');

    // The sign-in route is prerendered, so the form is on screen before the
    // application is running. Its submit button is disabled until then - see
    // login-page.ts for why that matters - and waiting for it is also what a
    // user has to do, because typing before hydration is discarded.
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeEnabled();

    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('any-value-works');
    await signIn.click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByTestId('list-summary')).toBeVisible();

    // --- create, so the record this test edits is its own -----------------
    const name = uniqueName();
    const email = uniqueEmail();

    await page.getByRole('link', { name: 'New customer' }).first().click();
    await expect(page).toHaveURL(/\/customers\/new$/);

    await page.getByLabel('Full name').fill(name);
    await page.getByLabel('Email').fill(email);
    await page.getByTestId('save').click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    const detailUrl = page.url();

    // --- search finds it, and the search term is in the URL ---------------
    await page.getByRole('link', { name: 'Back to customers' }).click();
    await page.getByLabel('Search', { exact: true }).fill(name);

    // The search term reaches the URL, once, after typing settles.
    await expect(page).toHaveURL(/search=/);
    await expect(page.getByRole('link', { name })).toBeVisible();

    // --- open it from the list -------------------------------------------
    await page.getByRole('link', { name }).click();
    await expect(page).toHaveURL(detailUrl);

    // --- edit and save ----------------------------------------------------
    await page.getByRole('link', { name: 'Edit' }).click();
    const editedName = `${name} (edited)`;
    await page.getByLabel('Full name').fill(editedName);
    await page.getByTestId('save').click();

    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(editedName);

    // --- the audit trail recorded it --------------------------------------
    await page.getByRole('link', { name: 'Audit trail' }).click();
    await expect(page.getByTestId('audit-entries')).toContainText('Customer updated');
    await expect(page.getByTestId('audit-entries')).toContainText(editedName);

    // --- delete -----------------------------------------------------------
    await page.getByRole('link', { name: 'Back to the customer' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete this customer?' });
    await expect(dialog).toContainText(editedName);
    await page.getByTestId('confirm-delete').click();

    await expect(page).toHaveURL(/\/customers$/);

    // Gone from the list as well as from the record: the cache was
    // invalidated rather than left to go stale.
    await page.getByLabel('Search', { exact: true }).fill(editedName);
    await expect(page.getByTestId('list-empty')).toBeVisible();
  });
});

test.describe('validation', () => {
  test('says what is wrong before the server is ever asked', async ({ page }) => {
    await page.goto('/customers/new');

    await page.getByTestId('save').click();

    await expect(page.getByText('This field is required.').first()).toBeVisible();
    await expect(page).toHaveURL(/\/customers\/new$/);
  });

  test('refuses an email another customer already has', async ({ page, api, baseURL }) => {
    const existing = await anyCustomer(api, baseURL ?? '', 6);

    await page.goto('/customers/new');
    await page.getByLabel('Full name').fill(uniqueName());
    await page.getByLabel('Email').fill(existing.email);
    // Tab out: a field's message appears once the user has had a chance at it,
    // not while they are still typing in it.
    await page.getByLabel('Email').press('Tab');

    // The asynchronous check the client cannot answer on its own.
    await expect(page.getByText('Another customer already uses this email address.')).toBeVisible();
  });

  test('requires a phone number once the customer is made active', async ({ page }) => {
    await page.goto('/customers/new');
    await page.getByLabel('Full name').fill(uniqueName());
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Status', { exact: true }).selectOption('ACTIVE');

    await page.getByTestId('save').click();

    await expect(page.getByTestId('cross-field-error')).toContainText(
      'An active customer needs a phone number',
    );
  });
});

test.describe('unsaved changes', () => {
  test('asks before letting an edit be thrown away', async ({ page, api, baseURL }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 7);
    await page.goto(`/customers/${customer.id}/edit`);

    await page.getByLabel('Full name').fill('Something else entirely');
    await page.getByRole('link', { name: 'Customers' }).first().click();

    await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();

    await page.getByRole('button', { name: 'Stay on this page' }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await expect(page.getByLabel('Full name')).toHaveValue('Something else entirely');

    await page.getByRole('link', { name: 'Customers' }).first().click();
    await page.getByTestId('confirm-accept').click();
    await expect(page).toHaveURL(/\/customers$/);
  });
});

test.describe('optimistic concurrency', () => {
  test('a write that lost a race is explained, and the edit survives it', async ({
    page,
    context,
    api,
    baseURL,
  }) => {
    const customer = await anyCustomer(api, baseURL ?? '', 8);
    await page.goto(`/customers/${customer.id}/edit`);
    await expect(page.getByLabel('Full name')).toHaveValue(customer.fullName);

    const myChange = `${customer.fullName} (mine)`;
    await page.getByLabel('Full name').fill(myChange);

    // Someone else saves first. This really happens - no scenario header, no
    // stubbing; the record's version genuinely moves on.
    await updateCustomerOutOfBand(context, baseURL ?? '', customer, {
      phone: '+84900000001',
    });

    await page.getByTestId('save').click();

    await expect(page.getByTestId('conflict')).toBeVisible();
    // The typing is still there: the application offers to reload rather than
    // to discard, because the user cannot see what they would be losing.
    await expect(page.getByLabel('Full name')).toHaveValue(myChange);

    await page.getByRole('button', { name: 'Reload the newest version' }).click();
    await expect(page.getByTestId('reloaded-notice')).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue(myChange);

    await page.getByTestId('save').click();
    await expect(page).toHaveURL(new RegExp(`/customers/${customer.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(myChange);

    // The other person's change survived, because only the changed field was
    // sent - which is what PATCH against a known version buys.
    await expect(page.getByTestId('customer-facts')).toContainText('+84900000001');

    // Put the name back, so a second run of the suite starts from the same
    // place. The phone number the other user set is left, because that is
    // exactly what surviving the merge means.
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByLabel('Full name').fill(customer.fullName);
    await page.getByTestId('save').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(customer.fullName);
  });
});

test.describe('bulk operations', () => {
  test('reports per item when only some of a batch succeed', async ({ page }) => {
    // The scenario header makes every second item fail, which is the shape a
    // real partial failure has and is otherwise not reproducible on demand.
    await page.route('**/api/customers/bulk', async (route) => {
      await route.continue({
        headers: { ...route.request().headers(), 'x-mock-scenario': 'partial-bulk-failure' },
      });
    });

    // The last records by code, which nothing else in the suite touches: the
    // whole suite runs in parallel against one dataset.
    await page.goto('/customers?size=10&sort=customerCode,desc');
    await expect(page.getByTestId('list-summary')).toBeVisible();

    await page.getByTestId('select-all').click();
    await expect(page.getByTestId('selection-count')).toContainText('10 selected');

    await page.getByTestId('bulk-deactivate').click();

    const report = page.getByTestId('bulk-report');
    await expect(report).toContainText('5 of 10 succeeded.');
    await expect(report).toContainText('5 were changed by someone else.');

    // The failures stay selected so they can be tried again - the whole point
    // of reporting per item rather than as one outcome.
    await expect(page.getByTestId('selection-count')).toContainText('5 selected');
  });
});
