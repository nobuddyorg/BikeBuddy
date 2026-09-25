// Markdown for stdout and the job summary; the JSON is what load/compare.mjs reads.
import { PROFILE, PROFILE_NAME } from './profile.js';
import { SEED } from './seed.js';
import { API_URL, TARGET } from './target.js';

const milliseconds = (value) => `${value.toFixed(1)} ms`;
const percent = (value) => `${(value * 100).toFixed(2)}%`;

function scenarioRow(metrics, scenario) {
  const requests = metrics[`http_reqs{scenario:${scenario}}`].values;
  const failed = metrics[`http_req_failed{scenario:${scenario}}`].values;
  const duration = metrics[`http_req_duration{scenario:${scenario}}`].values;
  return `| ${scenario} | ${requests.count} | ${requests.rate.toFixed(2)} | ${failed.passes} (${percent(failed.rate)}) | ${milliseconds(duration.med)} | ${milliseconds(duration['p(95)'])} | ${milliseconds(duration['p(99)'])} |`;
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
    `All requests, setup and teardown included: ${metrics.http_reqs.values.count}, ${metrics.http_req_failed.values.passes} failed, ${metrics.http_req_timeouts?.values.count ?? 0} timed out; p50 ${milliseconds(all.med)}, p95 ${milliseconds(all['p(95)'])}, p99 ${milliseconds(all['p(99)'])}.`,
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
