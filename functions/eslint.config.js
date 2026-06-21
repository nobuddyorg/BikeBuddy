'use strict';

const js = require('@eslint/js');
const { default: pluginN } = require('eslint-plugin-n');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  pluginN.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      'n/no-missing-require': 'error',
      'n/no-unpublished-require': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
  },
];
