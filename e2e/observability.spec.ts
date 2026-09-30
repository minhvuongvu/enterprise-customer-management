import type { ConsoleMessage, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Observability across the wire (docs/observability.md).
 *
 * One user action, one correlation id: the browser generates it, sends it as
 * `x-correlation-id`, logs it; the mock API reuses it and logs it too. These
 * tests read the browser's log from the console, and the server's through
 * `/api/_mock/logs` - the mock's stand-in for a log aggregator's search - and
 * join the two on the id.
 */

interface LogLine {
  readonly level: string;
  readonly message: string;
  readonly correlationId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly route?: string;
  readonly status?: number;
  readonly [field: string]: unknown;
}

/** Every structured line the page writes, from now on. */
function collectBrowserLog(page: Page): LogLine[] {
  const lines: LogLine[] = [];
  page.on('console', (message: ConsoleMessage) => {
    try {
      const parsed = JSON.parse(message.text()) as unknown;
      if (parsed && typeof parsed === 'object' && 'message' in parsed) {
        lines.push(parsed as LogLine);
      }
    } catch {
      // Not one of ours: a framework notice, a browser warning.
    }
  });
  return lines;
}

test('one correlation id appears in the browser log and in the API log', async ({
  page,
  api,
  baseURL,
}) => {
  const browserLog = collectBrowserLog(page);

  await page.goto('/customers');
  await expect(page.getByRole('table')).toBeVisible();

  const listRequest = () =>
    browserLog.find(
      (line) =>
        line.message === 'HTTP request completed' &&
        line.method === 'GET' &&
        line.url === '/api/customers',
    );
  await expect.poll(listRequest).toBeTruthy();
  const correlationId = listRequest()?.correlationId ?? '';
  expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);

  const response = await api.get(`${baseURL}/api/_mock/logs?correlationId=${correlationId}`);
  const { entries } = (await response.json()) as { entries: LogLine[] };

  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    correlationId,
    service: 'mock-api',
    method: 'GET',
    route: '/api/customers',
    status: 200,
    role: 'ADMIN',
  });
});

test.describe('signed out', () => {
  test.use({ signIn: false });

  test('a sign-in leaves no password, token or cookie in either log', async ({
    page,
    api,
    baseURL,
  }) => {
    const password = 'observable-but-never-logged-7431';
    const browserLog = collectBrowserLog(page);

    await page.goto('/login');
    // Hydrated before typing: a key pressed mid-hydration can be dropped.
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    await page.getByLabel('Username').fill('manager');
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/customers/);

    const signIn = browserLog.find((line) => line.url === '/api/auth/login');
    expect(signIn?.correlationId, 'the sign-in request was logged').toBeTruthy();
    // The interaction event names the role, never the person.
    expect(browserLog.find((line) => line['event'] === 'session.signed_in')).toMatchObject({
      role: 'MANAGER',
    });

    const cookies = await page.context().cookies();
    const secrets = [password, ...cookies.map((cookie) => cookie.value).filter(Boolean)];

    const serverLog = JSON.stringify(
      ((await (await api.get(`${baseURL}/api/_mock/logs`)).json()) as { entries: LogLine[] })
        .entries,
    );
    const clientLog = JSON.stringify(browserLog);
    for (const secret of secrets) {
      expect(clientLog).not.toContain(secret);
      expect(serverLog).not.toContain(secret);
    }
    // And the server did log that very request, under the browser's id.
    expect(serverLog).toContain(String(signIn?.correlationId));
  });
});
