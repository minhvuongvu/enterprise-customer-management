import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end and accessibility testing.
 *
 * Lives at the workspace root rather than inside `apps/web`, because from
 * Phase 0.5 a journey spans the application *and* the mock API, and a test that
 * belongs to both does not belong to either package.
 *
 * Phase 0 runs one browser. Phase 6 widens the matrix, when there is enough UI
 * for cross-browser differences to mean anything.
 */
const PORT = 4200;
const BASE_URL = `http://localhost:${PORT}`;

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

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run start --workspace @ecm/web',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
