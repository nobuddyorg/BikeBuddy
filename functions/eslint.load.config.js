'use strict';

// ESLint config for load/: k6 scripts (*.js, run by k6's own runtime) and their Node tooling (*.mjs).
const js = require('@eslint/js');
const sonarjs = require('eslint-plugin-sonarjs');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    ...sonarjs.configs.recommended,
    rules: {
      ...sonarjs.configs.recommended.rules,
      // The same bound as functions/eslint.config.js.
      'sonarjs/cognitive-complexity': ['warn', 11],
      'sonarjs/pseudo-random': 'off', // Math.random picks a load-test traffic mix, never a secret
      'sonarjs/publicly-writable-directories': 'off', // /tmp/func.log is start-backend's local host log
      'sonarjs/no-os-command-from-path': 'off', // run.mjs starts the developer's own k6 from PATH
    },
  },
  {
    files: ['load/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      // k6's runtime: its environment, the running VU and iteration, open() for fixtures, Web Crypto.
      globals: {
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        open: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
      },
    },
  },
  {
    files: ['load/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: globals.node },
  },
];
