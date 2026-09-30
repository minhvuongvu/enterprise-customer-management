import { defineConfig, devices } from '@playwright/test';
import { WEB_SERVERS } from './playwright.config';

/**
 * Visual regression (docs/testing-strategy.md, "Visual regression").
 *
 * Selective by design: the design-system components in their states, and the
 * critical pages, in both themes and both languages where that changes the
 * pixels. Not every element - a screenshot of everything fails on every
 * harmless change, and a suite that always fails is ignored.
 *
 * **Baselines are only valid in one environment**: the Playwright Docker image
 * CI uses (`mcr.microsoft.com/playwright:v1.63.0-noble`). Fonts, anti-aliasing
 * and sub-pixel rounding differ between machines, so a baseline from a laptop
 * fails on CI and the reverse. `npm run e2e:visual` runs the suite in that
 * image on any machine with Docker; `npm run e2e:visual:update` rewrites the
 * baselines there. Running this config outside the image is refused, rather
 * than producing a wall of false failures.
 *
 * Deterministic inputs: a fresh mock API on its fixed seed (the E2E suite
 * mutates data, so this suite never shares its servers), UTC, `en-US`, no
 * animation, one worker.
 */
if (!process.env['PLAYWRIGHT_VISUAL_IN_DOCKER'] && !process.env['CI']) {
  throw new Error(
    'Visual baselines are only valid inside the Playwright Docker image. Run `npm run e2e:visual`.',
  );
}

export default defineConfig({
  testDir: './e2e-visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : [['list']],

  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Anti-aliasing noise only. A changed colour, spacing or line break is
      // far above this.
      maxDiffPixelRatio: 0.002,
    },
  },

  use: {
    baseURL: 'http://localhost:4200',
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // The same two servers as the E2E suite, never reused: a server the
  // functional suite has written to would show different data.
  webServer: WEB_SERVERS.map((server) => ({ ...server, reuseExistingServer: false })),
});
