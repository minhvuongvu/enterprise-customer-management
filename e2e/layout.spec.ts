import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { anyCustomer, expect, test } from './fixtures';

/**
 * The layout, at the three widths it is designed for, plus the behaviour that
 * only a real browser can check: focus.
 *
 * jsdom decides nothing is focusable, because it gives every element zero
 * size - so the focus trap, the focus restore and the skip link are verified
 * here rather than in a unit test that would pass for the wrong reason.
 */

const DESKTOP = { width: 1280, height: 900 };
const TABLET = { width: 900, height: 800 };
const MOBILE = { width: 390, height: 780 };

/** The element that currently has focus, as a readable description. */
async function focusedDescription(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) {
      return 'none';
    }
    const label = active.getAttribute('aria-label') ?? active.textContent?.trim() ?? '';
    return `${active.tagName.toLowerCase()}:${label.slice(0, 40)}`;
  });
}

test.describe('responsive layout', () => {
  test('desktop keeps navigation permanently on screen', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/customers');

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Navigation menu', exact: true })).toHaveCount(0);
  });

  test('tablet keeps the navigation but collapses it to a rail', async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto('/customers');

    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav).toBeVisible();

    // The label is off-screen, not removed: the link is still reachable by its
    // accessible name, which is the only name an icon has.
    const link = nav.getByRole('link', { name: 'Customers' });
    await expect(link).toBeVisible();
    const railWidth = await nav.evaluate((element) => element.getBoundingClientRect().width);
    expect(railWidth).toBeLessThan(120);
  });

  test('mobile replaces the sidebar with a drawer rather than shrinking it', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/customers');

    // Not on the page at all until it is asked for - that is the difference
    // between an adaptive layout and a squeezed one.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

    const menu = page.getByRole('button', { name: 'Navigation menu', exact: true });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible();
    // The button keeps its name and reports its state, rather than renaming
    // itself and saying the same thing twice.
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  });

  test('the mobile drawer traps focus, closes on Escape and gives focus back', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/customers');

    const menu = page.getByRole('button', { name: 'Navigation menu', exact: true });
    await menu.click();
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible();

    // Focus is inside the drawer, not left behind on the page underneath.
    const drawerHasFocus = await page.evaluate(
      () => document.querySelector('.drawer__panel')?.contains(document.activeElement) ?? false,
    );
    expect(drawerHasFocus).toBe(true);

    // Tabbing past the last control wraps back inside instead of walking into
    // the page behind the overlay.
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
    }
    const stillInside = await page.evaluate(
      () => document.querySelector('.drawer__panel')?.contains(document.activeElement) ?? false,
    );
    expect(stillInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toHaveCount(0);
    await expect(menu).toBeFocused();
  });

  test('closing the drawer by navigating leaves the user on the new page', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/customers');

    await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
    await page.getByRole('dialog', { name: 'Navigation menu' }).getByRole('link').first().click();

    await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toHaveCount(0);
  });

  test('the skip link is the first tab stop and moves focus to the content', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/customers');
    // The application renders after `load`, so tabbing immediately would send
    // the keystroke to an empty document.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

    await page.keyboard.press('Enter');

    // Scrolling is not enough: focus has to land in the content, or the next
    // Tab goes back to the top of the navigation.
    const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(focusedId).toBe('main-content');
  });
});

test.describe('dialog focus management', () => {
  /**
   * Opens a customer that really exists.
   *
   * The delete control only appears once the record has loaded, so the test
   * waits for the heading rather than for a timeout.
   */
  async function openACustomer(page: Page, api: APIRequestContext, baseURL: string) {
    const customer = await anyCustomer(api, baseURL, 2);
    await page.goto(`/customers/${customer.id}`);
    await expect(page.getByRole('heading', { level: 1, name: customer.fullName })).toBeVisible();
    return customer;
  }

  test('focus enters the dialog, stays in it, and returns to the trigger', async ({
    page,
    api,
    baseURL,
  }) => {
    await openACustomer(page, api, baseURL ?? '');

    const trigger = page.getByRole('button', { name: 'Delete', exact: true }).first();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Delete this customer?' });
    await expect(dialog).toBeVisible();
    expect(await focusedDescription(page)).not.toBe('body:');

    const inside = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
    );
    expect(inside).toBe(true);

    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Tab');
    }
    const stillInside = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
    );
    expect(stillInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('has no detectable accessibility violations while a dialog is open', async ({
    page,
    api,
    baseURL,
  }) => {
    await openACustomer(page, api, baseURL ?? '');
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('theme', () => {
  test('switches at runtime and survives a reload', async ({ page }) => {
    await page.goto('/customers');

    const html = page.locator('html');
    // No attribute at all means "follow the system", which is what paints the
    // first frame before any script runs.
    await expect(html).not.toHaveAttribute('data-theme', /.*/);

    await page.getByRole('button', { name: 'Colour theme' }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Nothing was re-fetched and no component re-rendered: the tokens changed.
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).not.toBe('rgb(247, 248, 250)');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('has no detectable accessibility violations in the dark theme', async ({ page }) => {
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Colour theme' }).click();
    await page.getByRole('menuitem', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Contrast is the reason this scan exists twice: a palette that passes in
    // one theme routinely fails in the other.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
