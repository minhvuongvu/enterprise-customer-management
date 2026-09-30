import { expect, test, type Page } from '@playwright/test';
import { forwardApi } from '../perf/production-servers.ts';
import { PERFORMANCE_BUDGETS } from '../apps/web/src/app/core/observability/performance-budgets.ts';

/**
 * Performance budgets, enforced on the production build (docs/performance.md,
 * "Budgets"). CI fails when one is exceeded.
 *
 * The measurements are the application's own: the `PerformanceMonitor` logs
 * each one as a structured line, and these tests read those lines from the
 * console. So a pass proves two things at once - the build is fast enough,
 * and the monitoring that would tell an operator otherwise actually works.
 *
 * Measured over loopback against a local mock API, these numbers are a lab
 * measurement, not a user's experience: they catch a regression - a route
 * that suddenly loads a megabyte, a render that blocks for a second - not a
 * slow network. The budgets are the same "good" thresholds the field monitor
 * uses, which a local production build clears with room to spare; a failure
 * here is a real regression, not noise.
 */

interface LogLine {
  readonly level: string;
  readonly message: string;
  readonly [field: string]: unknown;
}

function collectLog(page: Page): LogLine[] {
  const lines: LogLine[] = [];
  page.on('console', (message) => {
    try {
      const parsed = JSON.parse(message.text()) as LogLine;
      if (parsed && typeof parsed.message === 'string') {
        lines.push(parsed);
      }
    } catch {
      // not a structured line
    }
  });
  return lines;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('any');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('table tbody tr').first()).toBeVisible();
}

test.use({ serviceWorkers: 'block' });

test('initial load stays inside its budgets', async ({ page, context }) => {
  await forwardApi(context);
  const log = collectLog(page);

  await page.goto('/login');
  await expect.poll(() => log.find((line) => line.message.startsWith('Initial load'))).toBeTruthy();

  const load = log.find((line) => line.message.startsWith('Initial load'));
  // The measurement itself, in the report: a pass says "under budget", this says by how much.
  test.info().annotations.push({ type: 'measured', description: JSON.stringify(load) });
  expect(load?.message, JSON.stringify(load)).toBe('Initial load');
  // Measured, not merely absent: a null here would pass every comparison
  // below (Number(null) is 0) - which is how a monitor that reported before
  // the first paint went unnoticed until these lines were added.
  for (const metric of [
    'timeToFirstByteMs',
    'firstContentfulPaintMs',
    'largestContentfulPaintMs',
  ]) {
    expect(load?.[metric], metric).toEqual(expect.any(Number));
  }
  expect(Number(load?.['timeToFirstByteMs'])).toBeLessThanOrEqual(
    PERFORMANCE_BUDGETS.timeToFirstByteMs,
  );
  expect(Number(load?.['firstContentfulPaintMs'])).toBeLessThanOrEqual(
    PERFORMANCE_BUDGETS.firstContentfulPaintMs,
  );
  expect(Number(load?.['largestContentfulPaintMs'])).toBeLessThanOrEqual(
    PERFORMANCE_BUDGETS.largestContentfulPaintMs,
  );
});

test('route navigations, API calls and main-thread tasks stay inside their budgets', async ({
  page,
  context,
}) => {
  await forwardApi(context);
  const log = collectLog(page);

  await signIn(page);
  // A realistic path: list → detail → audit → edit → back to the list.
  await page.locator('table tbody tr a').first().click();
  await expect(page.getByTestId('customer-facts')).toBeVisible();
  await page.getByRole('link', { name: 'Audit trail' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Audit trail');
  await page.goBack();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await page.goto('/customers');
  await expect(page.locator('table tbody tr').first()).toBeVisible();

  const overBudget = log.filter((line) => line.message.endsWith('over budget'));
  const navigations = log.filter((line) => line.message.startsWith('Route navigation'));
  const apiCalls = log.filter((line) => line.message.startsWith('API call'));

  test.info().annotations.push({
    type: 'measured',
    description: JSON.stringify({
      navigations: navigations.map((line) => [line['route'], line['durationMs']]),
      apiCalls: apiCalls.map((line) => [line['endpoint'], line['durationMs']]),
    }),
  });
  // The monitor saw the journey - otherwise "nothing over budget" means nothing.
  expect(navigations.length).toBeGreaterThanOrEqual(3);
  expect(apiCalls.length).toBeGreaterThanOrEqual(4);
  expect(overBudget, JSON.stringify(overBudget, null, 2)).toEqual([]);
  expect(log.filter((line) => line.message === 'Long task')).toEqual([]);
});

test('developer tooling is not in the production build', async ({ page, context }) => {
  await forwardApi(context);
  await signIn(page);

  await page.goto('/technical-labs/observability');

  // The build-time flag removed the in-memory log; the lab says so.
  await expect(page.getByTestId('log-unavailable')).toBeVisible();
  await expect(page.getByTestId('api-latency')).toBeVisible();
});
