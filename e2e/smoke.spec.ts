import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

/**
 * The foundation, in a real browser.
 *
 * It does not test a feature - there are none yet. It tests that routing
 * resolves, lazy chunks load, translations render, the shell puts its
 * landmarks where it claims, and the accessibility harness works. Everything
 * later phases build on is exercised here once.
 */

test.describe('application foundation', () => {
  test('the start route lands on the customer list', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/customers$/);
    // Text comes from the translation layer, so seeing it proves Transloco
    // resolved and the lazy language chunk loaded.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customers');
  });

  test("Phase 0's /home still works instead of 404ing", async ({ page }) => {
    await page.goto('/home');

    await expect(page).toHaveURL(/\/customers$/);
  });

  test('the public login route renders', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  });

  test('an unknown route renders not-found inside the shell, with a way out', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    // The navigation is still there: a 404 that strands the user is a support
    // ticket rather than a dead end they can recover from.
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();

    await page.getByRole('link', { name: 'Go to customers' }).click();
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('every page has exactly one main landmark', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.locator('main')).toHaveCount(1);

    // The login page is outside the shell and brings its own.
    await page.goto('/login');
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('the document title is translated, not the route key', async ({ page }) => {
    await page.goto('/customers');
    await expect(page).toHaveTitle('Customers · Customer Management');

    await page.goto('/customers/new');
    await expect(page).toHaveTitle('New customer · Customer Management');
  });

  test('has no detectable accessibility violations on the public surface', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('has no detectable accessibility violations in the application shell', async ({ page }) => {
    await page.goto('/customers');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
