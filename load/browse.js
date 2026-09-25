// Everyday reading: the list, a tour's detail panel and the map, side by side.
import * as flows from './lib/flows.js';
import { LIFECYCLE_TIMEOUTS, SUMMARY_TREND_STATS, rampTo, thresholdsFor } from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    list: { executor: 'ramping-vus', exec: 'list', stages: rampTo(5) },
    detail: { executor: 'ramping-vus', exec: 'detail', stages: rampTo(5) },
    map: { executor: 'ramping-vus', exec: 'map', stages: rampTo(3) },
  },
  thresholds: thresholdsFor(['list', 'detail', 'map']),
};

export const list = () => flows.browseList();
export const detail = (data) => flows.openDetail(data.tourIds);
export const map = () => flows.browseMap();

export function handleSummary(data) {
  return summarize('browse', data);
}
