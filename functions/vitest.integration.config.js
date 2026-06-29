import { defineConfig } from 'vitest/config';

// Integration tests hit a real, locally running Azure Functions host over HTTP.
// globalSetup starts the host before the suite and stops it after. Cosmos +
// Azurite must already be up (the CI job starts them; locally use buddy.sh).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['test/integration/**/*.test.js'],
    globalSetup: ['test/integration/globalSetup.js'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
