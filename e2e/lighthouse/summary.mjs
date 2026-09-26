// lhci's manifest.json per state as a markdown table of the metrics the
// lighthouserc.*.json files assert on; appended to $GITHUB_STEP_SUMMARY in CI.
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const e2e = fileURLToPath(new URL('..', import.meta.url));
const STATES = [
  { label: 'Signed out', state: 'signed-out' },
  { label: 'Signed in (seeded tours)', state: 'signed-in' },
];

// Thresholds straight from each state's lighthouserc, so the table and the gate agree.
async function thresholds(state) {
  const rc = JSON.parse(await readFile(`${e2e}lighthouse/lighthouserc.${state}.json`, 'utf8'));
  const a = rc.ci.assert.assertions;
  return {
    performance: a['categories:performance'][1].minScore,
    accessibility: a['categories:accessibility'][1].minScore,
    lcp: a['largest-contentful-paint'][1].maxNumericValue,
    tbt: a['total-blocking-time'][1].maxNumericValue,
    cls: a['cumulative-layout-shift'][1].maxNumericValue,
  };
}

const mark = (ok) => (ok === undefined ? '➖' : ok ? '✅' : '❌');
const pct = (score) => (Number.isFinite(score) ? `${Math.round(score * 100)}` : 'n/a');

async function row({ label, state }) {
  let entries;
  try {
    entries = JSON.parse(await readFile(`${e2e}lighthouse-reports/${state}/manifest.json`, 'utf8'));
  } catch {
    return `| ${label} | _no report_ | | | | | | |`;
  }
  // lhci marks one representative run per URL when numberOfRuns > 1.
  const run = entries.find((e) => e.isRepresentativeRun) ?? entries.at(-1);
  const report = JSON.parse(await readFile(run.jsonPath, 'utf8'));
  const t = await thresholds(state);
  const { performance, accessibility } = run.summary;
  const lcp = report.audits['largest-contentful-paint']?.numericValue;
  const tbt = report.audits['total-blocking-time']?.numericValue;
  const cls = report.audits['cumulative-layout-shift']?.numericValue;
  return [
    label,
    `${mark(performance >= t.performance)} ${pct(performance)}`,
    `${mark(accessibility >= t.accessibility)} ${pct(accessibility)}`,
    pct(run.summary['best-practices']),
    pct(run.summary.seo),
    `${mark(lcp <= t.lcp)} ${Number.isFinite(lcp) ? `${(lcp / 1000).toFixed(1)} s` : 'n/a'}`,
    `${mark(tbt <= t.tbt)} ${Number.isFinite(tbt) ? `${Math.round(tbt)} ms` : 'n/a'}`,
    `${mark(cls <= t.cls)} ${Number.isFinite(cls) ? cls.toFixed(3) : 'n/a'}`,
  ]
    .map((cell) => `| ${cell} `)
    .join('')
    .concat('|');
}

const markdown = [
  '## 🔦 Lighthouse CI',
  '',
  'Scores 0-100, median of three runs. Full HTML reports: the `lighthouse-reports` artifact.',
  '',
  '| State | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |',
  '|---|---|---|---|---|---|---|---|',
  ...(await Promise.all(STATES.map(row))),
  '',
].join('\n');

// The log too: the job summary has no API, and the thresholds are recalibrated from runner numbers.
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
