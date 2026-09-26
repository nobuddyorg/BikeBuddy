import MCR, { type CoverageReportOptions, type CoverageResults } from 'monocart-coverage-reports';

// V8 JS coverage of the app's own modules (frontend/src/*.js, lib/, ui/) as the
// Playwright journeys exercise them. On when E2E_COVERAGE=1 (CI sets it); the
// fixture in pages/buddy-test.ts collects per page, global-teardown.ts reports.

export type Suite = 'static' | 'fullstack';

export const coverageEnabled = () => process.env.E2E_COVERAGE === '1';

// Measured on CI (docs/how-to/developer-guide.md, "E2E coverage"); raised when
// the journeys grow, never lowered.
const FLOORS: Record<Suite, { lines: number; functions: number }> = {
  // Measured 57.86 % lines / 49.58 % functions on CI (60.56 % / 53.46 % locally).
  static: { lines: 55, functions: 47 },
  // Measured 76.48 % lines / 75.49 % functions on CI (run 36062531313).
  fullstack: { lines: 73, functions: 72 },
};

// Only the app's own modules: not the vendored bundles, not the config shim.
const APP_MODULE = /^https?:\/\/[^/]+\/(?:(?:lib|ui)\/[\w-]+|app|sw)\.js(?:\?.*)?$/;

function coverageOptions(suite: Suite): CoverageReportOptions {
  return {
    name: `BikeBuddy e2e coverage (${suite})`,
    outputDir: `coverage-e2e/${suite}`,
    reports: ['v8', 'console-summary', 'markdown-summary', 'json-summary'],
    entryFilter: (entry) => APP_MODULE.test(entry.url),
    // The report names files after the served path (lib/tours.js, ui/sidebar.js).
    sourcePath: (filePath) => filePath.replace(/^[^/]*localhost[^/]*\//, 'frontend/src/'),
    onEnd: (results) => checkFloor(suite, results),
  };
}

function checkFloor(suite: Suite, results: CoverageResults | undefined) {
  // A passing run with nothing collected means the fixture never ran: that is a failure, not 0 %.
  if (!results) throw new Error(`e2e coverage (${suite}): no coverage was collected`);
  const { summary } = results;
  const floor = FLOORS[suite];
  const failures = (Object.keys(floor) as (keyof typeof floor)[])
    .filter((metric) => Number(summary[metric].pct) < floor[metric])
    .map((metric) => `${metric} ${summary[metric].pct} % < floor ${floor[metric]} %`);
  if (failures.length > 0) {
    throw new Error(`e2e coverage (${suite}) below its floor: ${failures.join(', ')}`);
  }
}

export const coverageReport = (suite: Suite) => MCR(coverageOptions(suite));
