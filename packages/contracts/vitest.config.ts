import { defineConfig } from 'vitest/config';

/**
 * The tests import `@ecm/contracts` as the apps do - the compiled package -
 * so coverage is measured on `dist/`. Thresholds are a ratchet; see
 * docs/testing-strategy.md.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['dist/**/*.js'],
      allowExternal: true,
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 95, branches: 95, functions: 85, lines: 95 },
    },
  },
});
