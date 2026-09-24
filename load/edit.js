// Editing: rename, date correction and delete of freshly uploaded tours.
import * as flows from './lib/flows.js';
import { LIFECYCLE_TIMEOUTS, SUMMARY_TREND_STATS, rampTo, thresholdsFor } from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: {
    edit: { executor: 'ramping-vus', exec: 'edit', stages: rampTo(3) },
  },
  thresholds: thresholdsFor(['edit']),
};

export const edit = () => flows.editAndDelete();

export function handleSummary(data) {
  return summarize('edit', data);
}
