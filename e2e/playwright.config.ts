import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4281;
const isCI = !!process.env.CI;

// Static UI tests: serve frontend/src with a dependency-free file server; the
// app's devMode falls back to a synthetic local user, so no backend is needed.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI
    ? [
        ['github'],
        ['junit', { outputFile: 'reports/e2e-results.xml' }],
        ['html', { open: 'never' }],
      ]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    env: { E2E_PORT: String(PORT) },
  },
});
