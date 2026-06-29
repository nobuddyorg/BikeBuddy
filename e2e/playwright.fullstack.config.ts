import { defineConfig, devices } from '@playwright/test';

// Full-stack config: assumes the Functions host is already running on :7071
// (started by the workflow / buddy.sh). The SWA CLI serves the frontend and
// proxies /api → :7071, so the app talks to the real backend.
const PORT = 4280;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests-fullstack',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1, // backend writes — keep deterministic
  reporter: isCI
    ? [['github'], ['junit', { outputFile: 'reports/e2e-fullstack-results.xml' }], ['list']]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `swa start ../frontend/src --api-devserver-url http://localhost:7071 --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
