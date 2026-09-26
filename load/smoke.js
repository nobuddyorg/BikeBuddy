// One iteration of every journey before a heavier run: correctness thresholds only, no latency limits.
import * as flows from './lib/flows.js';
import { LIFECYCLE_TIMEOUTS, SUMMARY_TREND_STATS, correctnessThresholds } from './lib/options.js';
import { summarize } from './lib/summary.js';

export { setup, teardown } from './lib/seed.js';

const ONCE = { executor: 'per-vu-iterations', vus: 1, iterations: 1 };
const SCENARIOS = ['list', 'detail', 'map', 'upload_tour', 'upload_image', 'edit', 'export'];

export const options = {
  ...LIFECYCLE_TIMEOUTS,
  summaryTrendStats: SUMMARY_TREND_STATS,
  scenarios: Object.fromEntries(
    SCENARIOS.map((name) => [name, { ...ONCE, exec: name === 'export' ? 'exportAll' : name }]),
  ),
  thresholds: correctnessThresholds(SCENARIOS),
};

export const list = () => flows.browseList();
export const detail = (data) => flows.openDetail(data.tourIds);
export const map = () => flows.browseMap();
export const upload_tour = () => flows.addTour();
export const upload_image = () => flows.addPhoto();
export const edit = () => flows.editAndDelete();
// `export` is a reserved word, so its scenario runs `exportAll`.
export const exportAll = () => flows.exportAll();

export function handleSummary(data) {
  return summarize('smoke', data);
}
