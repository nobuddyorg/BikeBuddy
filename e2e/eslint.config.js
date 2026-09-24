import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';

export default defineConfig([
  { ignores: ['reports/**', 'playwright-report*/**', 'test-results/**', '.local-*.config.ts'] },
  js.configs.recommended,
  // Type-aware: the page objects' types are the contract every spec relies on.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  // Plain JS helpers (serve.mjs, this file) are not in tsconfig.json.
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**', 'tests-fullstack/**', 'pages/**'],
    extends: [playwright.configs['flat/recommended']],
    // Specs import the page-object fixture as `buddyTest` (pages/buddy-test.ts).
    settings: { playwright: { globalAliases: { test: ['buddyTest'] } } },
  },
]);
