import { defineConfig } from 'vitest/config';

// Integration tests hit a real Azure Functions host over HTTP with real signed tokens.
// globalSetup starts a local OIDC issuer and its own host on :7072 before the suite and
// stops both after. Cosmos + Azurite must already be up (the CI job starts them; locally
// use buddy.sh).
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
