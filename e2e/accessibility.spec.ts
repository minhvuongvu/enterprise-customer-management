import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { anyCustomer, expect, test } from './fixtures';

/**
 * The accessibility audit: axe on every route, in both themes.
 *
 * The rest of the suite scans a few pages as a side effect of testing them.
 * This file is the systematic pass Phase 6 asks for: every route the
 * application has, light and dark, plus the states that only exist after an
 * interaction (an open dialog, menu or panel) - because a dialog that is
 * never opened during a scan is never scanned.
 *
 * **What fails the build**: any violation axe rates `critical` or `serious`.
 * Every WCAG 2.2 A/AA rule is run, and the best-practice rules too.
 * `moderate` and `minor` findings do not fail a test; they are attached to it
 * and summarised in docs/accessibility.md, where each is either fixed or
 * explained. Hiding them would be worse than failing on them, and failing on
 * advisory rules would teach people to turn the scan off.
 *
 * Contrast is part of the WCAG AA rules, so running every route in both
 * themes is also the contrast check for both themes.
 *
 * axe finds perhaps a third of real accessibility problems. The keyboard
 * journeys in keyboard.spec.ts and the manual notes in docs/accessibility.md
 * are the other two thirds.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** The route list. Kept here, flat, so a new route is one line. */
const PUBLIC_ROUTES = [
  '/login',
  '/rendering-lab/client',
  '/rendering-lab/server',
  '/rendering-lab/prerender',
  '/rendering-lab/prerender-no-hydration',
  '/rendering-lab/prerender-incremental',
];

const LAB_IDS = [
  'api-connectivity',
  'rendering',
  'performance',
  'browser-storage',
  'browser-apis',
  'workers',
  'offline',
  'cross-tab',
  'leader-election',
  'locale',
];

const APP_ROUTES = [
  '/customers',
  '/customers/new',
  '/customers/:id',
  '/customers/:id/edit',
  '/customers/:id/audit',
  '/customers/import',
  '/forbidden',
  '/no-such-page',
  '/technical-labs',
  ...LAB_IDS.map((id) => `/technical-labs/${id}`),
  '/technical-labs/no-such-lab',
];

type Theme = 'light' | 'dark';

async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((choice) => {
    try {
      localStorage.setItem('ecm.theme', choice);
    } catch {
      // A page whose storage is blocked keeps the system theme.
    }
  }, theme);
}

/**
 * Waits for a page to have finished rendering what a user would see: its
 * `<h1>`, and no pending skeleton. Scanning a loading state would audit the
 * skeleton instead of the page.
 */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
}

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  const advisory = results.violations.filter((violation) => !blocking.includes(violation));

  // Attached rather than asserted: visible in the report, counted in the docs.
  await test.info().attach(`axe ${label}`, {
    body: JSON.stringify(
      advisory.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      })),
      null,
      2,
    ),
    contentType: 'application/json',
  });

  expect(
    blocking.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    })),
    `${label}: critical or serious axe violations`,
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    test.describe('public routes', () => {
      test.use({ signIn: false });

      for (const route of PUBLIC_ROUTES) {
        test(route, async ({ page }) => {
          await useTheme(page, theme);
          await page.goto(route);
          await settle(page);
          await audit(page, `${theme} ${route}`);
        });
      }
    });

    test.describe('application routes', () => {
      for (const route of APP_ROUTES) {
        test(route, async ({ page, api, baseURL }) => {
          const customer = route.includes(':id') ? await anyCustomer(api, baseURL ?? '', 41) : null;
          await useTheme(page, theme);
          await page.goto(customer ? route.replace(':id', customer.id) : route);
          await settle(page);
          await audit(page, `${theme} ${route}`);
        });
      }
    });

    test.describe('states that exist only after an interaction', () => {
      test('the confirmation dialog', async ({ page, api, baseURL }) => {
        const customer = await anyCustomer(api, baseURL ?? '', 42);
        await useTheme(page, theme);
        await page.goto(`/customers/${customer.id}`);
        await settle(page);
        await page.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await audit(page, `${theme} delete dialog`);
      });

      test('an open menu', async ({ page }) => {
        await useTheme(page, theme);
        await page.goto('/customers');
        await settle(page);
        await page.getByRole('button', { name: /Language/ }).click();
        await expect(page.getByRole('menu')).toBeVisible();
        await audit(page, `${theme} language menu`);
      });

      test('the notification panel', async ({ page }) => {
        await useTheme(page, theme);
        await page.goto('/customers');
        await settle(page);
        await page.getByTestId('notification-bell').click();
        await expect(page.getByTestId('notification-panel')).toBeVisible();
        await audit(page, `${theme} notification panel`);
      });

      test('a failed save, with every field error showing', async ({ page }) => {
        await useTheme(page, theme);
        await page.goto('/customers/new');
        await settle(page);
        await page.getByRole('button', { name: 'Create customer' }).click();
        await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
        await audit(page, `${theme} form errors`);
      });

      test('the mobile layout with its drawer open', async ({ page }) => {
        await useTheme(page, theme);
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto('/customers');
        await settle(page);
        await audit(page, `${theme} mobile list`);
        await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible();
        await audit(page, `${theme} mobile drawer`);
      });
    });
  });
}

test.describe('reduced motion', () => {
  test.use({ colorScheme: 'light' });

  test('transitions collapse to nothing when the system asks for less motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/customers');
    await settle(page);

    const duration = await page
      .getByRole('button', { name: 'Refresh' })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    // 0.01ms rather than 0: a transition that still ends fires its
    // transitionend, and nothing waiting for one is left hanging.
    expect(duration.split(',').every((part) => parseFloat(part) <= 0.00001)).toBe(true);
  });

  test('and run normally when it does not', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/customers');
    await settle(page);

    const duration = await page
      .getByRole('button', { name: 'Refresh' })
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(parseFloat(duration)).toBeGreaterThan(0.05);
  });
});
