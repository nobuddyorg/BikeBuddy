import { PROFILE } from './profile.js';

export const SUMMARY_TREND_STATS = ['avg', 'med', 'p(95)', 'p(99)', 'max'];

// Seeding uploads up to 1,000 tracks through the API; k6's 60 s default is not enough.
export const LIFECYCLE_TIMEOUTS = { setupTimeout: '15m', teardownTimeout: '10m' };

// Calibrated at the normal profile: docs/how-to/load-testing.md, "Thresholds".
const P95_MS = {
  list: 16400,
  detail: 13350,
  map: 43900,
  upload_tour: 800,
  upload_image: 300,
  edit: 400,
  export: 11700,
};

/** Failures, timeouts and checks per named scenario, with no latency limit. */
export function correctnessThresholds(scenarios) {
  const thresholds = {
    http_req_failed: ['rate<0.01'],
    http_req_timeouts: ['count<1'],
    checks: ['rate>0.99'],
  };
  for (const scenario of scenarios) {
    thresholds[`http_req_duration{scenario:${scenario}}`] = [];
    thresholds[`http_req_failed{scenario:${scenario}}`] = ['rate<0.01'];
    thresholds[`http_reqs{scenario:${scenario}}`] = ['count>0'];
  }
  return thresholds;
}

/** Correctness thresholds plus each scenario's p95 limit. */
export function thresholdsFor(scenarios) {
  const thresholds = correctnessThresholds(scenarios);
  for (const scenario of scenarios) {
    thresholds[`http_req_duration{scenario:${scenario}}`] = [`p(95)<${P95_MS[scenario]}`];
  }
  return thresholds;
}

/** The profile's stages for a scenario whose normal load is `vus`. */
export function rampTo(vus) {
  return PROFILE.stages.map(([duration, fraction]) => ({
    duration,
    target: Math.ceil(vus * PROFILE.vusScale * fraction),
  }));
}
