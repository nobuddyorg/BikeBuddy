// Writing: GPX uploads (parse, simplify, store) and photo uploads (EXIF, resize).
import * as flows from './lib/flows.js';
import { LIFECYCLE_TIMEOUTS, SUMMARY_TREND_STATS, rampTo, thresholdsFor } from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    upload_tour: { executor: 'ramping-vus', exec: 'uploadTour', stages: rampTo(2) },
    upload_image: { executor: 'ramping-vus', exec: 'uploadImage', stages: rampTo(2) },
  },
  thresholds: thresholdsFor(['upload_tour', 'upload_image']),
};

export const uploadTour = () => flows.addTour();
export const uploadImage = () => flows.addPhoto();

export function handleSummary(data) {
  return summarize('upload', data);
}
