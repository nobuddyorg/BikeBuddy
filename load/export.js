// The GDPR export for a heavy account: every tour and image in one response.
import * as flows from './lib/flows.js';
import { LIFECYCLE_TIMEOUTS, SUMMARY_TREND_STATS, rampTo, thresholdsFor } from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    export: { executor: 'ramping-vus', exec: 'exportAll', stages: rampTo(1) },
  },
  thresholds: thresholdsFor(['export']),
};

export const exportAll = () => flows.exportAll();

export function handleSummary(data) {
  return summarize('export', data);
}
