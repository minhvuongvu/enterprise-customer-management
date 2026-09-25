import { expect, test } from '@playwright/test';
import { forwardApi } from '../perf/production-servers.ts';

/**
 * The production build's own behaviour (playwright.production.config.ts).
 *
 * Browser-integration tests: a real service worker, a real offline switch,
 * the real chunk graph.
 */

test.describe('service worker', () => {
  test('once installed, the application starts with the network off', async ({ page, context }) => {
    await page.goto('/login');
    // Registered once the application is stable; wait until it controls
    // this origin. A first visit is not controlled - the next load is.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    // The app shell is prefetched in the background after install; wait for
    // Angular's service worker to report every asset of it cached.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const names = await caches.keys();
            return names.some((name) => name.includes('app-shell'));
          }),
        { timeout: 15_000 },
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await context.setOffline(false);
  });

  test('never caches API responses', async ({ page, context }) => {
    await forwardApi(context);
    await page.goto('/login');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('any');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('table tbody tr').first()).toBeVisible();

    const cachedApiUrls = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          urls.push(request.url);
        }
      }
      return urls.filter((url) => url.includes('/api/'));
    });
    expect(cachedApiUrls).toEqual([]);
  });
});

test.describe('route preloading', () => {
  test('the sign-in page fetches the next page in the background - unless the flag is off', async ({
    browser,
  }) => {
    const scriptsLoaded = async (preloading: boolean): Promise<number> => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await context.route('**/config.json', (route) =>
        route.fulfill({ json: { features: { technicalLabs: true, routePreloading: preloading } } }),
      );
      const page = await context.newPage();
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      const count = await page.evaluate(
        () =>
          performance.getEntriesByType('resource').filter((entry) => entry.name.endsWith('.js'))
            .length,
      );
      await context.close();
      return count;
    };

    const without = await scriptsLoaded(false);
    const withPreloading = await scriptsLoaded(true);
    // The shell, the customer routes and the list page, at least.
    expect(withPreloading).toBeGreaterThanOrEqual(without + 3);
  });
});
