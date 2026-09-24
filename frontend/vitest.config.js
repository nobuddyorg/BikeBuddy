import { defineConfig } from 'vitest/config';

import { FRONTEND_TARGETS, perFileThresholds } from '../mutation-targets.mjs';

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
    environment: 'node',
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // lcov → Codecov; json-summary → CI job summary; text → CI log
      reporter: ['text', 'lcov', 'json-summary'],
      // The pure logic; src/ui/ and the entry points are the e2e suites' job.
      include: ['src/lib/**/*.js'],
      thresholds: {
        ...GLOBAL_COVERAGE_THRESHOLDS,
        // Never write the local measurement back into this file.
        autoUpdate: false,
        // Built from the list Stryker mutates, so the two cannot drift.
        ...perFileThresholds(FRONTEND_TARGETS),
      },
    },
  },
});
