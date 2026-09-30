import { defineConfig } from 'vitest/config';

/**
 * Coverage is measured in CI (`npm run test:coverage`) and gated by these
 * thresholds - a ratchet set just under what the suite reaches at
 * phase-7-complete, so a change that drops coverage fails the build and a
 * change that raises it can raise them (docs/testing-strategy.md).
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 88, branches: 75, functions: 92, lines: 88 },
    },
  },
});
