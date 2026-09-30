import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Every journey, with the keyboard only.
 *
 * No `click()` in this file: focus moves by Tab, Shift+Tab and the arrow keys,
 * and things are activated by Enter, Space and Escape - what a keyboard user,
 * a switch user and most screen-reader users actually have. A control that is
 * reachable only by pointer fails here, as does one that traps focus, loses
 * it, or leaves it somewhere invisible.
 *
 * `tabTo` presses Tab until the target has focus, and fails if it never does.
 * That is the assertion: the control is in the tab order, in a sensible
 * place, within a bounded number of presses.
 */

async function isFocused(target: Locator): Promise<boolean> {
  return target.evaluate((element) => element === document.activeElement);
}

async function tabTo(page: Page, target: Locator, options: { max?: number; back?: boolean } = {}) {
  const max = options.max ?? 60;
  for (let presses = 0; presses < max; presses++) {
    await page.keyboard.press(options.back ? 'Shift+Tab' : 'Tab');
    if (await isFocused(target)) {
      return presses + 1;
    }
  }
  throw new Error(`not reached by keyboard within ${max} presses: ${target.toString()}`);
}

async function expectFocused(target: Locator): Promise<void> {
  await expect.poll(() => isFocused(target)).toBe(true);
}

/** Tag and name of the focused element, for failure messages. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    return element
      ? `${element.tagName.toLowerCase()} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30) ?? ''}`
      : 'none';
  });
}

test.describe('signing in', () => {
  test.use({ signIn: false });

  test('from the sign-in form to the customer list, focus landing on the page heading', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    // The page is server-rendered; the button is enabled once it has hydrated.
    // Typing before that is a different test (e2e-production/login-hydration):
    // here, on a loaded CI runner, a key pressed mid-hydration was dropped.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();

    await tabTo(page, page.getByLabel('Username'));
    await page.keyboard.type('admin');
    await tabTo(page, page.getByLabel('Password'));
    await page.keyboard.type('anything');
    await page.keyboard.press('Enter');

    const heading = page.getByRole('heading', { level: 1, name: 'Customers' });
    await expect(heading).toBeVisible();
    // The form that had focus is gone; focus is on what replaced it, so a
    // screen reader announces the new page and Tab starts from its top.
    await expectFocused(heading);
  });
});

test.describe('the shell', () => {
  test('the skip link is the first stop and moves focus into the content', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expectFocused(skip);
    await expect(skip).toBeInViewport();

    await page.keyboard.press('Enter');
    await expectFocused(page.locator('main'));
    // The next stop is inside the content, not back in the header.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(true);
  });

  test('navigating by the sidebar moves focus to the new page', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await tabTo(
      page,
      page
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Technical labs' }),
    );
    await page.keyboard.press('Enter');

    await expectFocused(page.getByRole('heading', { level: 1, name: 'Technical labs' }));
  });

  test('the theme menu opens, moves with arrow keys, chooses and gives focus back', async ({
    page,
  }) => {
    await page.goto('/customers');
    const trigger = page.getByRole('button', { name: 'Colour theme' });
    await tabTo(page, trigger);

    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toBeVisible();
    // Focus goes into the menu; the arrow keys move within it.
    await expectFocused(page.getByRole('menuitemradio', { name: 'Light' }));
    await page.keyboard.press('ArrowDown');
    await expectFocused(page.getByRole('menuitemradio', { name: 'Dark' }));
    await page.keyboard.press('Enter');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expectFocused(trigger);
  });

  test('the language menu switches language from the keyboard', async ({ page }) => {
    await page.goto('/customers');
    await tabTo(page, page.getByRole('button', { name: /Language/ }));
    await page.keyboard.press('Enter');
    await expectFocused(page.getByRole('menuitemradio', { name: 'English' }));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Khách hàng' })).toBeVisible();
    // Escape on a closed menu does nothing harmful; focus is still on the
    // trigger, now named in the new language.
    await expectFocused(page.getByRole('button', { name: /Ngôn ngữ/ }));
  });

  test('the notification panel opens, and Escape closes it with focus restored', async ({
    page,
  }) => {
    await page.goto('/customers');
    const bell = page.getByTestId('notification-bell');
    await tabTo(page, bell);
    await page.keyboard.press('Enter');

    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    await expectFocused(panel);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expectFocused(bell);
  });
});

test.describe('the customer list', () => {
  test('sorts from a column header with Enter', async ({ page }) => {
    await page.goto('/customers');
    const header = page.getByRole('columnheader', { name: /Full name/ });
    await tabTo(page, header.getByRole('button'));
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/sort=fullName%2Casc|sort=fullName,asc/);
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    // The new order arrived with a skeleton in between; focus is back on the
    // header that was pressed, not on <body>.
    await expectFocused(header.getByRole('button'));
  });

  test('changes page without taking focus away from the pagination', async ({ page }) => {
    await page.goto('/customers');
    const next = page.getByRole('button', { name: 'Next page' });
    await tabTo(page, next, { max: 120 });
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/page=2/);
    // A change of page is a change of query, not of page: focus does not
    // jump to the heading. And the page of results that replaced the old one
    // did not strand it on <body>: it is on the page the user is now on.
    await expectFocused(page.getByRole('button', { name: 'Go to page 2', exact: true }));
  });

  test('selects rows with Space and deletes through a trapped, restorable dialog', async ({
    page,
  }) => {
    await page.goto('/customers');
    const firstRow = page.getByRole('checkbox', { name: /^Select (?!every)/ }).first();
    await tabTo(page, firstRow);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

    const bulkDelete = page
      .getByTestId('selection-count')
      .locator('..')
      .getByRole('button', { name: 'Delete' });
    await tabTo(page, bulkDelete, { back: true });
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Delete the selected customers?' });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);

    // Ten presses of Tab and ten of Shift+Tab: focus never leaves the dialog.
    for (let press = 0; press < 10; press++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"], .scrim'),
      );
      expect(inside, `Tab ${press + 1} escaped to ${await focused(page)}`).toBe(true);
    }
    for (let press = 0; press < 10; press++) {
      await page.keyboard.press('Shift+Tab');
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"], .scrim'),
      );
      expect(inside, `Shift+Tab ${press + 1} escaped to ${await focused(page)}`).toBe(true);
    }

    // Escape is "no": nothing is deleted, and focus returns to the button.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expectFocused(bulkDelete);
    await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  });
});

test.describe('the customer form', () => {
  test('a failed save moves focus to the first field that needs attention', async ({ page }) => {
    await page.goto('/customers');
    await tabTo(page, page.getByRole('link', { name: 'New customer' }));
    await page.keyboard.press('Enter');
    await expectFocused(page.getByRole('heading', { level: 1, name: 'New customer' }));

    const create = page.getByRole('button', { name: 'Create customer' });
    await tabTo(page, create);
    await page.keyboard.press('Enter');

    const fullName = page.getByLabel(/Full name/);
    await expectFocused(fullName);
    await expect(fullName).toHaveAttribute('aria-invalid', 'true');
    // The field names its error through aria-describedby, so arriving on it
    // is enough for a screen reader to say what is wrong.
    const describedBy = (await fullName.getAttribute('aria-describedby')) ?? '';
    await expect(page.locator(`[id="${describedBy.split(' ').pop()}"]`)).toHaveText(
      'This field is required.',
    );
  });

  test('a customer is created, start to finish, from the keyboard', async ({ page }) => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await page.goto('/customers/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New customer' })).toBeVisible();

    await tabTo(page, page.getByLabel(/Full name/));
    await page.keyboard.type('Keyboard Only');
    await page.keyboard.press('Tab');
    await expectFocused(page.getByLabel(/Email/));
    await page.keyboard.type(`keyboard-${stamp}@example.test`);

    await tabTo(page, page.getByRole('button', { name: 'Create customer' }));
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { level: 1, name: 'Customer' })).toBeVisible();
    await expect(page.getByText('Keyboard Only').first()).toBeVisible();
  });
});

test.describe('notifications', () => {
  test('a toast waits while the pointer or focus is on it, and is dismissed by keyboard', async ({
    page,
  }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Exporting ends with a toast. Enter on the focused button - no click.
    await tabTo(page, page.getByTestId('export').getByRole('button'));
    const download = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    await download;
    const toast = page.getByTestId('toasts').locator('.toast').first();
    await expect(toast).toHaveText(/Export downloaded/);

    // The pointer resting on it holds it well past its five seconds.
    await toast.hover();
    await page.waitForTimeout(6_000);
    await expect(toast).toBeVisible();

    // So does focus: the pointer leaves, the keyboard arrives. The toasts
    // are last in the document, so Tab reaches them after the page.
    await page.mouse.move(0, 0);
    const dismiss = toast.getByRole('button', { name: 'Dismiss' });
    await tabTo(page, dismiss, { max: 150 });
    await page.waitForTimeout(6_000);
    await expect(toast).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.getByTestId('toasts').locator('.toast')).toHaveCount(0);
  });
});
