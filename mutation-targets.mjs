// Feeds both Stryker's `mutate` and Vitest's per-file floor; paths relative to each package (design-decisions.md, "Mutation scope").

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
  'src/lib/concurrency.js',
  'src/lib/debounce.js',
  'src/lib/files.js',
  'src/lib/format.js',
  'src/lib/i18n.js',
  'src/lib/lineStyle.js',
  'src/lib/mapData.js',
  'src/lib/pinLayout.js',
  'src/lib/sasCache.js',
  'src/lib/stats.js',
  'src/lib/tours.js',
  'src/lib/upload.js',
  'src/lib/url.js',
];

// Never lowered (CLAUDE.md, hard rules): close a gap with a test or by extracting the logic.
export const PER_FILE_FLOOR = { statements: 100, branches: 100, functions: 100, lines: 100 };

/** Vitest `coverage.thresholds` entries: one per target file. */
export function perFileThresholds(targets) {
  return Object.fromEntries(targets.map((path) => [path, PER_FILE_FLOOR]));
}
