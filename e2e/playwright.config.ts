import { defineConfig, devices } from '@playwright/test';

// Read by coverage.ts in the runner and every worker.
process.env.E2E_SUITE = 'static';

const PORT = Number(process.env.E2E_PORT) || 4281;
const isCI = !!process.env.CI;

// Static UI tests: serve frontend/src with a dependency-free file server; the
// app's devMode falls back to a synthetic local user, so no backend is needed.
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0, // a flake is a defect: fixed or deleted, never retried
  reporter: isCI
    ? [
        ['github'],
        // JSON feeds the job summary (.github/actions/playwright-results); HTML is the failure artifact.
        ['json', { outputFile: 'reports/e2e-results.json' }],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    env: { E2E_PORT: String(PORT) },
  },
});
