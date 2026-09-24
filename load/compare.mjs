// Baseline vs candidate for the optimization loop (docs/how-to/load-testing.md,
// "Run the optimization loop"): per scenario p50/p95/p99, error rate and
// throughput from k6's JSON summaries, and per handler server p95 and RU per
// request from the backend reports, as a delta table with a noise band.
//   node load/compare.mjs <baseline dir> <candidate dir> <flow> [--band 20]
// Each dir holds <flow>.json (k6) and, optionally, <flow>.backend.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);

/** Relative change in percent, and whether it clears the noise band. */
export function delta(before, after, band, lowerIsBetter = true) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return { text: 'n/a', verdict: '' };
  if (before === 0) return { text: after === 0 ? '±0%' : 'new', verdict: '' };
  const change = ((after - before) / before) * 100;
  const text = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (Math.abs(change) <= band) return { text, verdict: 'within noise' };
  const better = lowerIsBetter ? change < 0 : change > 0;
  return { text, verdict: better ? '✅ better' : '❌ worse' };
}

function scenarios(k6) {
  return Object.keys(k6.metrics)
    .map((name) => /^http_reqs\{scenario:(.+)\}$/.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

function k6Rows(base, cand, band) {
  const rows = [];
  for (const scenario of scenarios(base)) {
    const metric = (data, name) => data.metrics[`${name}{scenario:${scenario}}`]?.values;
    for (const [label, pick, lowerIsBetter] of [
      ['p50', (d) => metric(d, 'http_req_duration')?.med, true],
      ['p95', (d) => metric(d, 'http_req_duration')?.['p(95)'], true],
      ['p99', (d) => metric(d, 'http_req_duration')?.['p(99)'], true],
      ['req/s', (d) => metric(d, 'http_reqs')?.rate, false],
      ['error rate', (d) => metric(d, 'http_req_failed')?.rate, true],
    ]) {
      const before = pick(base);
      const after = pick(cand);
      const { text, verdict } = delta(before, after, band, lowerIsBetter);
      rows.push(
        `| ${scenario} | ${label} | ${before?.toFixed(2) ?? 'n/a'} | ${after?.toFixed(2) ?? 'n/a'} | ${text} | ${verdict} |`,
      );
    }
  }
  return rows;
}

function backendRows(base, cand, band) {
  const rows = [];
  const byHandler = (report) => new Map(report.handlers.map((h) => [h.handler, h]));
  const ruByHandler = (report) => {
    const map = new Map();
    for (const c of report.cosmos)
      map.set(c.handler, (map.get(c.handler) ?? 0) + (c.ruPerRequest ?? 0));
    return map;
  };
  const [bh, ch, bru, cru] = [
    byHandler(base),
    byHandler(cand),
    ruByHandler(base),
    ruByHandler(cand),
  ];
  for (const [handler, b] of bh) {
    const c = ch.get(handler);
    if (!c) continue;
    for (const [label, before, after] of [
      ['server p95 ms', b.p95Ms, c.p95Ms],
      ['response KB', b.avgKb, c.avgKb],
      ['RU per request', bru.get(handler) ?? 0, cru.get(handler) ?? 0],
    ]) {
      const { text, verdict } = delta(before, after, band);
      rows.push(`| ${handler} | ${label} | ${before} | ${after} | ${text} | ${verdict} |`);
    }
  }
  if (base.runtime && cand.runtime) {
    const { text, verdict } = delta(base.runtime.loopP99MaxMs, cand.runtime.loopP99MaxMs, band);
    rows.push(
      `| (worker) | event-loop p99 ms | ${base.runtime.loopP99MaxMs} | ${cand.runtime.loopP99MaxMs} | ${text} | ${verdict} |`,
    );
  }
  return rows;
}

export function compareMarkdown({ flow, baseline, candidate, band }) {
  const base = read(join(baseline, `${flow}.json`));
  const cand = read(join(candidate, `${flow}.json`));
  if (!base || !cand) throw new Error(`need ${flow}.json in both ${baseline} and ${candidate}`);
  const lines = [
    `## ${flow}: ${baseline} → ${candidate}`,
    '',
    `Noise band ±${band}%: identical runs differ by about that much, so only a change beyond it counts.`,
    '',
    '| Scenario | Metric | Baseline | Candidate | Change | Verdict |',
    '| --- | --- | --- | --- | --- | --- |',
    ...k6Rows(base, cand, band),
    '',
  ];
  const bb = read(join(baseline, `${flow}.backend.json`));
  const cb = read(join(candidate, `${flow}.backend.json`));
  if (bb && cb) {
    lines.push(
      '| Handler | Metric | Baseline | Candidate | Change | Verdict |',
      '| --- | --- | --- | --- | --- | --- |',
      ...backendRows(bb, cb, band),
      '',
    );
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { band: { type: 'string', default: '20' } },
  });
  const [baseline, candidate, flow] = positionals;
  if (!flow)
    throw new Error(
      'usage: node load/compare.mjs <baseline dir> <candidate dir> <flow> [--band 20]',
    );
  console.log(compareMarkdown({ flow, baseline, candidate, band: Number(values.band) }));
}
