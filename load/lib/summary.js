// The end-of-test report: per scenario the request count, rate, failures and
// p50/p95/p99; then every threshold. Markdown for stdout and the job summary,
// JSON for load/compare.mjs.
import { PROFILE, PROFILE_NAME } from './profile.js';
import { SEED } from './seed.js';
import { API_URL, TARGET } from './target.js';

const ms = (value) => `${value.toFixed(1)} ms`;
const percent = (value) => `${(value * 100).toFixed(2)}%`;

function scenarioRow(metrics, scenario) {
  const requests = metrics[`http_reqs{scenario:${scenario}}`].values;
  const failed = metrics[`http_req_failed{scenario:${scenario}}`].values;
  const duration = metrics[`http_req_duration{scenario:${scenario}}`].values;
  return `| ${scenario} | ${requests.count} | ${requests.rate.toFixed(2)} | ${failed.passes} (${percent(failed.rate)}) | ${ms(duration.med)} | ${ms(duration['p(95)'])} | ${ms(duration['p(99)'])} |`;
}

function thresholdRows(metrics) {
  return Object.keys(metrics)
    .sort()
    .flatMap((name) =>
      Object.entries(metrics[name].thresholds ?? {}).map(
        ([rule, { ok }]) => `| \`${name}\` | \`${rule}\` | ${ok ? '✅' : '❌'} |`,
      ),
    );
}

function markdown(flow, data) {
  const { metrics } = data;
  const scenarios = Object.keys(metrics)
    .map((name) => /^http_reqs\{scenario:(.+)\}$/.exec(name)?.[1])
    .filter(Boolean)
    .sort();
  const all = metrics.http_req_duration.values;
  return [
    `## k6 load test: \`${flow}\`, \`${PROFILE_NAME}\` profile, against ${TARGET}`,
    '',
    `Target \`${API_URL}\`; virtual users ×${PROFILE.vusScale} of normal; seed ${SEED.tours} tours. Charts over time: \`${flow}.html\` in the run's artifact.`,
    '',
    '| Scenario | Requests | Req/s | Failed | p50 | p95 | p99 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...scenarios.map((scenario) => scenarioRow(metrics, scenario)),
    '',
    `All requests, setup and teardown included: ${metrics.http_reqs.values.count}, ${metrics.http_req_failed.values.passes} failed, ${metrics.http_req_timeouts?.values.count ?? 0} timed out; p50 ${ms(all.med)}, p95 ${ms(all['p(95)'])}, p99 ${ms(all['p(99)'])}.`,
    '',
    'Thresholds are calibrated at the normal profile; peak and stress are meant to find where they break.',
    '',
    '| Metric | Threshold | Result |',
    '| --- | --- | --- |',
    ...thresholdRows(metrics),
    '',
  ].join('\n');
}

export function summarize(flow, data) {
  const report = markdown(flow, data);
  return {
    stdout: report,
    [`load-results/${flow}.md`]: report,
    [`load-results/${flow}.json`]: JSON.stringify(data, null, 2),
  };
}
