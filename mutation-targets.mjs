// The modules under both mutation testing (each package's stryker.config.mjs
// `mutate`) and a 100 % per-file coverage floor (each package's
// vitest.config.js), so the two lists cannot drift. Paths are relative to the
// package. Off the list on purpose: the Cosmos/Blob adapters and the multipart
// stream parser (exercised by the integration suite, not unit tests) and the
// DOM layer frontend/src/ui/ (exercised by Playwright). Why the list is
// explicit: docs/explanation/design-decisions.md, "Mutation scope".

export const FUNCTIONS_TARGETS = [
  'src/DeleteAccount/index.js',
  'src/DeleteImage/index.js',
  'src/DeleteTour/index.js',
  'src/EditTour/index.js',
  'src/ExportData/index.js',
  'src/GetMapData/index.js',
  'src/GetMe/index.js',
  'src/GetTour/index.js',
  'src/GetTours/index.js',
  'src/Health/index.js',
  'src/UpdateProfile/index.js',
  'src/UploadImage/index.js',
  'src/UploadTour/index.js',
  'src/lib/extractGps.js',
  'src/lib/heatmapCache.js',
  'src/lib/http.js',
  'src/lib/ownedTour.js',
  'src/lib/parseGpx.js',
  'src/lib/resizeImage.js',
  'src/lib/simplify.js',
  'src/lib/thumbBlobName.js',
  'src/lib/tourResponse.js',
  'src/lib/validation.js',
  'src/middleware/authMiddleware.js',
];

export const FRONTEND_TARGETS = [
  'src/lib/authConfig.js',
  'src/lib/concurrency.js',
  'src/lib/debounce.js',
  'src/lib/files.js',
  'src/lib/format.js',
  'src/lib/gestures.js',
  'src/lib/i18n.js',
  'src/lib/images.js',
  'src/lib/layout.js',
  'src/lib/lineStyle.js',
  'src/lib/mapData.js',
  'src/lib/pinLayout.js',
  'src/lib/routes.js',
  'src/lib/sasCache.js',
  'src/lib/sidebarView.js',
  'src/lib/stats.js',
  'src/lib/tourDetail.js',
  'src/lib/tours.js',
  'src/lib/upload.js',
  'src/lib/url.js',
];

// Every file on a list is fully covered; a gap is closed with a test or by
// extracting the logic, never by lowering this (CLAUDE.md, hard rules).
export const PER_FILE_FLOOR = { statements: 100, branches: 100, functions: 100, lines: 100 };

/** Vitest `coverage.thresholds` entries: one per target file. */
export function perFileThresholds(targets) {
  return Object.fromEntries(targets.map((path) => [path, PER_FILE_FLOOR]));
}
