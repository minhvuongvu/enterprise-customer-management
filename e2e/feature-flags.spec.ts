import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Runtime flags come from `config.json`, per deployment, with no rebuild
 * (docs/feature-flags.md). These tests serve a different `config.json` to the
 * same build - exactly what a second environment does.
 */
async function deployWith(page: Page, features: Record<string, boolean>): Promise<void> {
  await page.route('**/config.json', async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as { features: Record<string, boolean> };
    await route.fulfill({
      response,
      json: { ...config, features: { ...config.features, ...features } },
    });
  });
}

test('a deployment can switch customer import off without a release', async ({ page }) => {
  await deployWith(page, { customerImport: false });

  await page.goto('/customers');
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Import CSV' })).toHaveCount(0);

  // Not refused - absent: the route does not match, and the URL falls to the
  // next route that does - `:id`, which says there is no such customer. No
  // import page, no hint that one exists.
  await page.goto('/customers/import');
  await expect(page.getByTestId('detail-not-found')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import customers' })).toHaveCount(0);
});

test('the same build offers import where the flag is on', async ({ page }) => {
  await deployWith(page, { customerImport: true });

  await page.goto('/customers');
  await expect(page.getByRole('link', { name: 'Import CSV' })).toBeVisible();
});

test('a malformed config.json falls back to the defaults instead of half-applying', async ({
  page,
}) => {
  await page.route('**/config.json', (route) =>
    route.fulfill({ json: { features: { technicalLabs: 'false' } } }),
  );

  await page.goto('/technical-labs');
  // "false" is a string, and truthy - the schema rejects the file, the
  // defaults keep the labs on, and the error is in the log.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Technical labs');
});
