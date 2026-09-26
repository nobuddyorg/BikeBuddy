import { defineConfig } from 'vitest/config';

// Stryker's test config. Standalone rather than merged from vitest.config.js:
// Stryker runs in a sandbox copy of this package, where vitest.config.js's
// import of ../mutation-targets.mjs does not resolve, and coverage thresholds
// are the unit job's gate, not Stryker's. Keep `test` in step with vitest.config.js.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.test.js', 'test/unit/**/*.test.js', 'scripts/**/*.test.{js,mjs}'],
    exclude: [
      // Instrumented code is many times slower, so a timing bound would measure Stryker, not the code.
      '**/*.performance.test.js',
      // They read files outside this package, which the sandbox copy lacks; the unit job runs them.
      'test/unit/frontendContract.test.js',
      'test/unit/zapApiSurface.test.js',
      '**/node_modules/**',
    ],
    setupFiles: ['test/fast-check.setup.js'],
    // Vitest adds its `github-actions` reporter under GITHUB_ACTIONS; a killed
    // mutant is an expected failure, not an annotation.
    reporters: ['dot'],
  },
});
