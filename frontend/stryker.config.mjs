import { FRONTEND_TARGETS } from '../mutation-targets.mjs';

// Publish to the Stryker dashboard only when the API key is available (CI on
// main). `json` feeds functions/scripts/mutation-summary.mjs (CI job summary).
const reporters = ['html', 'clear-text', 'progress', 'json'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutation.config.js' },
  // Shared with vitest.config.js's per-file coverage floors (../mutation-targets.mjs).
  mutate: FRONTEND_TARGETS,
  coverageAnalysis: 'perTest',
  // PRs reuse main's results for unchanged code and tests; main runs with --force.
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  // Measured 84.76 % when introduced; raised as survivors are killed, never lowered.
  thresholds: {
    high: 95,
    low: 85,
    break: 83,
  },
  reporters,
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  // A second module on the same dashboard project: its own report and badge.
  dashboard: {
    reportType: 'full',
    module: 'frontend',
  },
};
