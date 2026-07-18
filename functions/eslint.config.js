'use strict';

const js = require('@eslint/js');
// eslint-plugin-n exports the plugin directly (v18.2+ dropped the `.default` wrapper).
const pluginN = require('eslint-plugin-n');
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
  {
    files: ['vitest.config.js'],
    languageOptions: { sourceType: 'module' },
    rules: { 'n/no-unpublished-import': 'off' },
  },
];
