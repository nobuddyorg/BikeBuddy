'use strict';

const js = require('@eslint/js');
// eslint-plugin-n exports the plugin directly (v18.2+ dropped the `.default` wrapper).
const pluginN = require('eslint-plugin-n');
const sonarjs = require('eslint-plugin-sonarjs');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  pluginN.configs['flat/recommended'],
  {
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    // devDependencies (vitest, eslint) are required in config/test files
    rules: { 'n/no-unpublished-require': 'off' },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: globals.vitest },
  },
  // Code-smell analysis for non-test source: a test's job is to be exhaustive, not non-repetitive.
  {
    ...sonarjs.configs.recommended,
    files: ['src/**/*.js', 'scripts/**/*.js'],
    ignores: ['**/*.test.js'],
    rules: {
      ...sonarjs.configs.recommended.rules,
      // 11: the lowest value that leaves the code clean (measured); reviewed, not gamed.
      'sonarjs/cognitive-complexity': ['warn', 11],
    },
  },
  {
    files: ['vitest.config.js', '**/*.mjs'],
    languageOptions: { sourceType: 'module' },
    rules: { 'n/no-unpublished-import': 'off' },
  },
];
