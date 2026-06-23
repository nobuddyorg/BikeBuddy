import { defineConfig, devices } from '@playwright/test';

// Full-stack config: assumes the Functions host is already running on :7071
// (started by the workflow / dev.sh). The SWA CLI serves the frontend and
// proxies /api → :7071, so the app talks to the real backend.
const PORT = 4280;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests-fullstack',
  globalSetup: './global-setup.ts',
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Backend writes are serial-friendly; keep it simple and deterministic.
  workers: 1,
  reporter: isCI
    ? [['github'], ['junit', { outputFile: 'reports/e2e-fullstack-results.xml' }], ['list']]
    : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `swa start ../frontend --api-devserver-url http://localhost:7071 --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
