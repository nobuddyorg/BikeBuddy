import { defineConfig } from 'vitest/config';

import { FUNCTIONS_TARGETS, perFileThresholds } from '../mutation-targets.mjs';

// Declared before the per-file floors: the CI coverage summary action reads the
// first `statements: N` in this file as the global threshold.
const GLOBAL_COVERAGE_THRESHOLDS = {
  statements: 99,
  branches: 99,
  functions: 99,
  lines: 99,
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    // Unit tests live next to the modules, or in test/unit when they span several;
    // test/integration needs a running host (vitest.integration.config.js).
    include: ['src/**/*.test.js', 'test/unit/**/*.test.js'],
    setupFiles: ['test/fast-check.setup.js'],
    coverage: {
      provider: 'v8',
      // lcov → Codecov; json-summary → CI job summary; text → CI log
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        // Infrastructure files exercised by Azurite integration tests, not unit tests:
        'src/lib/db.js',
        'src/lib/blobStorage.js',
      ],
      thresholds: {
        ...GLOBAL_COVERAGE_THRESHOLDS,
        // Never write the local measurement back into this file.
        autoUpdate: false,
        // Built from the list Stryker mutates, so the two cannot drift.
        ...perFileThresholds(FUNCTIONS_TARGETS),
      },
    },
  },
});
