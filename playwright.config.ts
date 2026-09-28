import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end and accessibility testing.
 *
 * Lives at the workspace root because a journey spans the application *and* the
 * mock API, and a test that belongs to both does not belong to either package.
 *
 * Both servers are started here. The application talks to the API through the
 * dev proxy, so the browser sees one origin - which is what makes the session
 * cookie first-party, exactly as a deployed setup behind a reverse proxy would.
 *
 * Chromium always runs. `E2E_BROWSERS=all` adds Firefox and WebKit - the
 * engines behind the two other browsers people use, and the ones where Web
 * Locks, BroadcastChannel and the Permissions API differ (debt row 28). Opt-in
 * rather than default because each engine is a separate download that a
 * sandboxed environment may not reach: the Phase 6 session could not fetch
 * them, so they are configured and not yet exercised. See docs/testing-strategy.md.
 */
const WEB_PORT = 4200;
const API_PORT = 4300;
const BASE_URL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A test that only passes when it is the only one running is not a test.
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env['E2E_BROWSERS'] === 'all'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],

  webServer: [
    {
      command: 'npm run serve --workspace @ecm/mock-api',
      // Waits for the health endpoint, not just for the port: a process that is
      // listening but has not finished seeding would fail the first test.
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        // Artificial latency exists to make loading states visible by hand. In
        // a test suite it only adds minutes.
        MOCK_API_LATENCY_MS: '0',
        MOCK_API_JITTER_MS: '0',
      },
    },
    {
      command: 'npm run start --workspace @ecm/web',
      url: BASE_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
