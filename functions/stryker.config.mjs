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
  coverageAnalysis: 'all',
  thresholds: {
    high: 80,
    low: 70,
    break: 60,
  },
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
};
