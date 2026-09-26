// @ts-check

import { MAX_UPLOAD_BYTES, MAX_TOUR_IMAGES } from './files.js';

const BYTES_PER_MEGABYTE = 1024 * 1024;

// The API sends a bare i18n key; the limits it names are the ones the frontend checks as well.
const PARAMS_BY_KEY = {
  'errors.fileSize': { maxMegabytes: MAX_UPLOAD_BYTES / BYTES_PER_MEGABYTE },
  'errors.tourImageLimit': { max: MAX_TOUR_IMAGES },
};

export function apiErrorParams(key) {
  return PARAMS_BY_KEY[key] ?? {};
}
