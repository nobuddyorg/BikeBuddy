import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    // Unit tests live next to the modules; integration tests (test/integration)
    // need a running func host and run via vitest.integration.config.js.
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // cobertura → CodeCoverageSummary (PR comment); lcov → Codecov; text → CI log
      reporter: ['text', 'cobertura', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/**/*.test.js',
        // Infrastructure files exercised by Azurite integration tests, not unit tests:
        'src/lib/db.js',
        'src/lib/blobStorage.js',
        'src/lib/parseMultipart.js',
      ],
    },
  },
});
