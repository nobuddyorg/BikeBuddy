// Publish to the Stryker dashboard only when the API key is available (CI on
// nobuddyorg/BikeBuddy). Local runs and key-less CI keep the offline reporters.
const reporters = ['html', 'clear-text', 'progress'];
if (process.env.STRYKER_DASHBOARD_API_KEY) reporters.push('dashboard');

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.js',
    // CJS require() imports are not traced by vitest's ES module graph
    related: false,
  },
  mutate: [
    'src/**/*.js',
    '!src/**/*.test.js',
    // Infrastructure files exercised only by Azurite integration tests — not unit-tested
    '!src/lib/db.js',
    '!src/lib/blobStorage.js',
    '!src/lib/parseMultipart.js',
  ],
  coverageAnalysis: 'perTest',
  // Skip mutants that only run at module load (app.http() registration, top-level
  // schema consts). Unit tests call handlers directly and never re-import per mutant,
  // so these can't be killed — and reloading the module per mutant blows the timeout.
  ignoreStatic: true,
  thresholds: {
    high: 90,
    low: 85,
    break: 85,
  },
  reporters,
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  // project/version are auto-detected from the CI git context (badge tracks main).
  dashboard: {
    reportType: 'full',
  },
};
