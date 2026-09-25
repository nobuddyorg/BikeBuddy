import { defineConfig, devices } from '@playwright/test';

// Read by coverage.ts in the runner and every worker.
process.env.E2E_SUITE = 'fullstack';

// Assumes the Functions host on :7071; the SWA CLI serves the frontend and proxies /api to it.
const PORT = 4280;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests-fullstack',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  forbidOnly: isCI,
  retries: 0, // a flake is a defect: fixed or deleted, never retried
  workers: 1, // every test runs as the one SKIP_AUTH user and resets that user's data
  reporter: isCI
    ? [
        ['github'],
        // JSON feeds the job summary (.github/actions/playwright-results); HTML is the failure artifact.
        ['json', { outputFile: 'reports/e2e-fullstack-results.json' }],
        ['html', { open: 'never', outputFolder: 'playwright-report-fullstack' }],
        ['list'],
      ]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // page.route cannot see a service worker's fetches; the worker itself is unit-tested (frontend/test/sw.test.js).
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `swa start ../frontend/src --api-devserver-url http://localhost:7071 --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
