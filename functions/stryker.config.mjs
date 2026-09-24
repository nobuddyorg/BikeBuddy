import { FUNCTIONS_TARGETS } from '../mutation-targets.mjs';

// Publish to the Stryker dashboard only when the API key is available (CI on
// main). `json` feeds scripts/mutation-summary.mjs (CI job summary).
const reporters = ['html', 'clear-text', 'progress', 'json'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.js',
    // CJS require() imports are not traced by vitest's ES module graph
    related: false,
  },
  // Shared with vitest.config.js's per-file coverage floors (../mutation-targets.mjs).
  mutate: FUNCTIONS_TARGETS,
  coverageAnalysis: 'perTest',
  // Skip mutants that only run at module load (app.http() registration, top-level
  // schema consts). Unit tests call handlers directly and never re-import per mutant,
  // so these can't be killed — and reloading the module per mutant blows the timeout.
  ignoreStatic: true,
  // PRs reuse main's results for unchanged code and tests; blind to changes in a
  // module a target imports, so main runs with --force (gate.yml).
  incremental: true,
  incrementalFile: 'reports/stryker-incremental.json',
  // Measured 96.46 %; raised as survivors are killed, never lowered.
  thresholds: {
    high: 97,
    low: 95,
    break: 95,
  },
  reporters,
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
  // project/version are auto-detected from the CI git context (badge tracks main).
  dashboard: {
    reportType: 'full',
  },
};
