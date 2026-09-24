'use strict';

// ESLint config for the browser frontend (frontend/src + frontend/test).
// The app and its helpers are ES modules; the few classic scripts (config.js)
// rely on browser/CDN globals (Leaflet `L`, `msal`, `BIKEBUDDY_CONFIG`).
const js = require('@eslint/js');
const sonarjs = require('eslint-plugin-sonarjs');
const globals = require('globals');

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
