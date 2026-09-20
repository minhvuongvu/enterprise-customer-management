// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');

/**
 * Lint configuration for everything that is not the Angular application.
 *
 * `apps/web` has its own config, because Angular's template rules and the
 * browser-global ban only make sense there. This one covers the contracts
 * package, the mock API and the end-to-end tests - all Node code, where
 * `console` is the correct output and there is no template to check.
 */
module.exports = defineConfig([
  {
    ignores: [
      'apps/web/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/.angular/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // Writing structured JSON to stdout is how a server process logs. There
      // is no Logger abstraction to route through here, and inventing one for
      // a mock backend would be an abstraction without a second caller.
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
