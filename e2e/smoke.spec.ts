import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke test.
 *
 * It does not test a feature - there are none yet. It tests that the
 * foundation holds together in a real browser: routing resolves, lazy chunks
 * load, translations render, and the accessibility harness works. Everything
 * later phases build on is exercised here once.
 */

test.describe('application foundation', () => {
  test('the start route redirects into the authenticated area', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/\/home$/);
    // Text comes from the translation layer, so seeing it proves Transloco
    // resolved and the lazy language chunk loaded.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer Management');
  });

  test('the public login route renders', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
  });

  test('an unknown route renders the not-found page and can get back', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');

    await page.getByRole('link', { name: 'Go to the start page' }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test('the routed view sits inside a main landmark', async ({ page }) => {
    await page.goto('/home');

    await expect(page.getByRole('main')).toBeVisible();
  });

  test('has no detectable accessibility violations on the public surface', async ({ page }) => {
    await page.goto('/login');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
