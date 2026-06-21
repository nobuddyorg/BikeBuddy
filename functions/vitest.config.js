import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      // cobertura → CodeCoverageSummary (PR comment); lcov → Codecov; text → CI log
      reporter: ['text', 'cobertura', 'lcov'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js'],
    },
  },
});
