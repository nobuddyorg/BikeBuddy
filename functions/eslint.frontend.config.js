'use strict';

// ESLint config for the browser frontend (frontend/src + frontend/test).
// The app and its helpers are ES modules; the few classic scripts (config.js)
// rely on browser/CDN globals (Leaflet `L`, `msal`, `BIKEBUDDY_CONFIG`).
const js = require('@eslint/js');
const sonarjs = require('eslint-plugin-sonarjs');
const globals = require('globals');

// User text is stored as typed (#574), so the page never parses a string as HTML;
// clearing with `innerHTML = ''` is the one exception.
const HTML_SINKS = [
  {
    selector:
      "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]:not([right.value=''])",
    message: 'Parses HTML: build elements and set textContent instead (#574).',
  },
  {
    selector:
      'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|parseFromString|setHTMLUnsafe|write|writeln|bindTooltip|bindPopup|setContent)$/]',
    message: 'Parses HTML (DOM or Leaflet): pass an element or set textContent instead (#574).',
  },
];

module.exports = [
  { ignores: ['frontend/src/vendor/**'] },
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        L: 'readonly',
        msal: 'readonly',
        BIKEBUDDY_CONFIG: 'readonly',
      },
    },
  },
  // Unit tests and their setup run in Node (Vitest), not the browser.
  {
    files: ['frontend/test/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { files: ['frontend/src/**/*.js'], rules: { 'no-restricted-syntax': ['error', ...HTML_SINKS] } },
  // lib/ is pure logic (CLAUDE.md, "Split by responsibility"): the clock, storage, the
  // network and the DOM reach it only as parameters.
  {
    files: ['frontend/src/lib/**/*.js'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'globalThis',
          'self',
          'document',
          'localStorage',
          'sessionStorage',
          'indexedDB',
          'navigator',
          'location',
          'history',
          'fetch',
          'XMLHttpRequest',
          'FormData',
        ].map((name) => ({ name, message: `lib/ is pure: take ${name} as a parameter.` })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'lib/ is pure: take `now` as a parameter.' },
      ],
      // Repeats HTML_SINKS: a later setting of a rule replaces an earlier one.
      'no-restricted-syntax': [
        'error',
        ...HTML_SINKS,
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'lib/ is pure: take `now` as a parameter.',
        },
      ],
    },
  },
  // Code-smell analysis for non-test source: a test's job is to be exhaustive, not non-repetitive.
  {
    ...sonarjs.configs.recommended,
    files: ['frontend/src/**/*.js'],
    rules: {
      ...sonarjs.configs.recommended.rules,
      // 11: the lowest value that leaves the code clean (measured); reviewed, not gamed.
      'sonarjs/cognitive-complexity': ['warn', 11],
    },
  },
];
