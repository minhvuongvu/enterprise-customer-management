// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

/**
 * Two of these rules exist because they are the ones that get broken silently
 * and cost a repository-wide refactor later:
 *
 *  - browser globals break the server build, and only at build time, long after
 *    the line was written;
 *  - a hardcoded user-facing string is invisible until Phase 6 has to find
 *    every one of them.
 *
 * See ANGULAR_PROJECT_CONTEXT.md 5.7.
 */

/** Globals that must be reached through core/platform/platform.tokens.ts. */
const BROWSER_GLOBALS = [
  {
    name: 'window',
    message:
      'Inject WINDOW from core/platform/platform.tokens instead - this code also runs on the server.',
  },
  {
    name: 'document',
    message: 'Inject DOCUMENT from @angular/core instead - this code also runs on the server.',
  },
  {
    name: 'localStorage',
    message: 'Inject LOCAL_STORAGE from core/platform/platform.tokens instead.',
  },
  {
    name: 'sessionStorage',
    message: 'Inject SESSION_STORAGE from core/platform/platform.tokens instead.',
  },
  {
    name: 'navigator',
    message: 'Not available while server rendering. Reach it through a token in core/platform.',
  },
  {
    name: 'location',
    message: 'Use Angular Router, or WINDOW from core/platform/platform.tokens.',
  },
  {
    name: 'history',
    message: 'Use Angular Router, or WINDOW from core/platform/platform.tokens.',
  },
];

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS],
      // Logging goes through the Logger abstraction so Phase 7 can add a sink
      // without touching call sites. core/logging/logger.ts opts out inline.
      'no-console': 'error',
    },
  },
  {
    // The server entry is Node code by definition, and a bootstrap failure
    // happens before the injector - and therefore the Logger - exists.
    files: ['src/server.ts', 'src/main.server.ts', 'src/main.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.html'],
    // index.html is a document, not an Angular template: the Angular template
    // rules do not apply to it and the i18n rule misreads <title> as copy.
    ignores: ['src/index.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // Flags literal text in templates. Everything a user reads must come
      // from the translation layer, so a bare sentence here is a bug.
      //
      // `checkAttributes` was turned on in Phase 1, once components with
      // `aria-label`, `placeholder` and `title` existed: those are read out to
      // screen-reader users and are exactly the strings that get missed,
      // because they do not look like copy. A binding satisfies the rule - an
      // attribute that is computed is not a hardcoded one.
      '@angular-eslint/template/i18n': [
        'error',
        {
          checkId: false,
          checkText: true,
          checkAttributes: true,
          // The rule checks every static attribute it does not already ignore,
          // so the ones that are not copy have to be named. Three groups, and
          // nothing else belongs here - an attribute a user can read must be a
          // binding, not an entry in this list.
          ignoreAttributes: [
            // ARIA state and live-region values: vocabulary, not text.
            'aria-current',
            'aria-live',
            // Test hooks and styling switches, never rendered.
            'data-testid',
            'data-direction',
            // SVG presentation attributes.
            'stroke-linecap',
            'stroke-linejoin',
            // Structural form wiring. A control name is an identifier the
            // template shares with the TypeScript, never something a user
            // reads, and it is never a binding.
            'formControlName',
            'formGroupName',
            // Table semantics.
            'scope',
            // Component inputs whose values are enum members, scoped to the
            // component that declares them so a same-named attribute
            // elsewhere is still checked.
            'app-badge[tone]',
            'app-button[variant]',
            'app-button[link]',
            'app-button[size]',
            'app-button[type]',
            'app-select[name]',
            'app-text-input[type]',
            'app-text-input[name]',
            'app-text-input[autocomplete]',
            'input[type]',
          ],
        },
      ],
    },
  },
  {
    // Specs run only in a browser-like environment, and often have to reach
    // the document directly: focus lives on it, and the CDK overlay container
    // is deliberately outside the component under test. The rule exists to
    // protect the server build, which no spec is part of.
    files: ['**/*.spec.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_GLOBALS.filter((global) => global.name !== 'document'),
      ],
    },
  },
  {
    // Inline templates inside specs are fixtures, not product copy. They exist
    // to be asserted against; routing them through the translation layer would
    // test Transloco rather than the component, and would hide the literal the
    // assertion is looking for. Last in the list, so it wins over the template
    // block above.
    files: ['**/*.spec.ts/*.html'],
    rules: {
      '@angular-eslint/template/i18n': 'off',
    },
  },
]);
