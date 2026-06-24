import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Full-stack config: assumes the Functions host is already running on :7071
// (started by the workflow / dev.sh). The SWA CLI serves the frontend and
// proxies /api → :7071, so the app talks to the real backend. Inherits the base
// config and overrides only the deltas.
const PORT = 4280;
const isCI = !!process.env.CI;

export default defineConfig({
  ...base,
  testDir: './tests-fullstack',
  workers: 1, // backend writes — keep deterministic
  reporter: isCI
    ? [['github'], ['junit', { outputFile: 'reports/e2e-fullstack-results.xml' }], ['list']]
    : [['list']],
  use: {
    ...base.use,
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `swa start ../frontend --api-devserver-url http://localhost:7071 --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
