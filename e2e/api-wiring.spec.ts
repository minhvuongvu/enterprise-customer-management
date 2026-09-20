import { expect, test } from '@playwright/test';

/**
 * The application really talks to the mock API.
 *
 * Everything between the two is exercised here and nowhere else: the dev proxy,
 * the runtime-configured base URL, the HTTP interceptors, and the response
 * validation in `HealthApi`. Unit tests mock the transport by design, so this
 * is the only place the wiring itself can fail visibly.
 *
 * It lives at `/technical-labs/api-connectivity` since Phase 1: connectivity
 * is a technique with no home in customer management, which is exactly what
 * the lab area is for.
 */

test.describe('application to API wiring', () => {
  test('the connectivity lab reaches the API and reports what it found', async ({ page }) => {
    await page.goto('/technical-labs/api-connectivity');

    await expect(page.getByTestId('api-status')).toHaveText('Connected to the mock API.');
    // Proves the response was parsed, not merely received.
    await expect(page.getByTestId('api-customers')).toContainText('customers in the dataset');
  });

  test('the request carries a correlation id and the API echoes it back', async ({ page }) => {
    const [request] = await Promise.all([
      page.waitForRequest((candidate) => candidate.url().includes('/api/health')),
      page.goto('/technical-labs/api-connectivity'),
    ]);

    const sent = request.headers()['x-correlation-id'];
    expect(sent).toBeTruthy();

    const response = await request.response();
    // Same id on both sides is what makes a failure traceable across the two
    // processes.
    expect(response?.headers()['x-correlation-id']).toBe(sent);
  });

  test('the API refuses an unauthenticated read, whatever the browser asks', async ({
    request,
  }) => {
    // Straight at the API, bypassing the application entirely: the server is
    // the security boundary, not the guard in the router.
    const response = await request.get('/api/customers');
    expect(response.status()).toBe(401);

    const body = (await response.json()) as { error: { code: string; correlationId: string } };
    expect(body.error.code).toBe('UNAUTHENTICATED');
    expect(body.error.correlationId).toBeTruthy();
  });

  test('the application degrades instead of breaking when the API fails', async ({ page }) => {
    // The interceptor classifies it, the page decides what to show. A user sees
    // a message, not a blank screen or a raw backend error.
    await page.route('**/api/health', (route) => route.abort('connectionrefused'));
    await page.goto('/technical-labs/api-connectivity');

    await expect(page.getByTestId('api-status')).toContainText('not reachable');
  });
});
