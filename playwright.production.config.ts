import { defineConfig, devices } from '@playwright/test';

/**
 * Tests that only mean something against the production build.
 *
 * The main suite (playwright.config.ts) runs against `ng serve`, which is a
 * development build: no service worker is registered there, chunks are not
 * hashed or preloaded the same way, and prerendered pages are rendered on
 * demand. What those tests cannot see, these can - the service worker
 * serving the application with the network off, and route preloading.
 *
 * Needs `npm run build` first; `npm run verify` runs it before this suite.
 * The production server serves the application only; the tests route `/api`
 * to the mock API themselves, as a reverse proxy would
 * (perf/production-servers.ts).
 */
export default defineConfig({
  testDir: './e2e-production',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:4400',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run serve --workspace @ecm/mock-api',
      url: 'http://localhost:4300/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      env: { MOCK_API_LATENCY_MS: '0', MOCK_API_JITTER_MS: '0' },
    },
    {
      command: 'node apps/web/dist/web/server/server.mjs',
      url: 'http://localhost:4400/login',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: { PORT: '4400', NG_ALLOWED_HOSTS: 'localhost' },
    },
  ],
});
