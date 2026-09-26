// Usage: node load/compare.mjs <baseline directory> <candidate directory> <flow> [--band 20]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Relative change in percent, and whether it clears the noise band; `better` is 'lower' or 'higher'. */
function delta({ before, after, band, better = 'lower' }) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return { text: 'n/a', verdict: '' };
  if (before === 0) return { text: after === 0 ? '±0%' : 'new', verdict: '' };
  const change = ((after - before) / before) * 100;
  const text = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (Math.abs(change) <= band) return { text, verdict: 'within noise' };
  const improved = better === 'lower' ? change < 0 : change > 0;
  return { text, verdict: improved ? '✅ better' : '❌ worse' };
}

function scenarios(k6Summary) {
  return Object.keys(k6Summary.metrics)
    .map((name) => /^http_reqs\{scenario:(.+)\}$/.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

function k6Rows({ baseline, candidate, band }) {
  const rows = [];
  for (const scenario of scenarios(baseline)) {
    const metric = (summary, name) => summary.metrics[`${name}{scenario:${scenario}}`]?.values;
    for (const [label, pick, better] of [
      ['p50', (summary) => metric(summary, 'http_req_duration')?.med, 'lower'],
      ['p95', (summary) => metric(summary, 'http_req_duration')?.['p(95)'], 'lower'],
      ['p99', (summary) => metric(summary, 'http_req_duration')?.['p(99)'], 'lower'],
      ['req/s', (summary) => metric(summary, 'http_reqs')?.rate, 'higher'],
      ['error rate', (summary) => metric(summary, 'http_req_failed')?.rate, 'lower'],
    ]) {
      const before = pick(baseline);
      const after = pick(candidate);
      const { text, verdict } = delta({ before, after, band, better });
      rows.push(
        `| ${scenario} | ${label} | ${before?.toFixed(2) ?? 'n/a'} | ${after?.toFixed(2) ?? 'n/a'} | ${text} | ${verdict} |`,
      );
    }
  }
  return rows;
}

const handlersByName = (report) => new Map(report.handlers.map((row) => [row.handler, row]));

function ruPerRequestByHandler(report) {
  const totals = new Map();
  for (const operation of report.cosmos) {
    totals.set(
      operation.handler,
      (totals.get(operation.handler) ?? 0) + (operation.ruPerRequest ?? 0),
    );
  }
  return totals;
}

function runtimeRows({ baseline, candidate, band }) {
  if (!baseline.runtime?.samples || !candidate.runtime?.samples) return [];
  const before = baseline.runtime.loopP99MaxMs;
  const after = candidate.runtime.loopP99MaxMs;
  const { text, verdict } = delta({ before, after, band });
  return [`| (worker) | event-loop p99 ms | ${before} | ${after} | ${text} | ${verdict} |`];
}

function backendRows({ baseline, candidate, band }) {
  const rows = [];
  const candidateHandlers = handlersByName(candidate);
  const baselineRu = ruPerRequestByHandler(baseline);
  const candidateRu = ruPerRequestByHandler(candidate);
  for (const [handler, baselineRow] of handlersByName(baseline)) {
    const candidateRow = candidateHandlers.get(handler);
    if (!candidateRow) continue;
    for (const [label, before, after] of [
      ['server p95 ms', baselineRow.p95Ms, candidateRow.p95Ms],
      ['response KB', baselineRow.avgKb, candidateRow.avgKb],
      ['RU per request', baselineRu.get(handler) ?? 0, candidateRu.get(handler) ?? 0],
    ]) {
      const { text, verdict } = delta({ before, after, band });
      rows.push(`| ${handler} | ${label} | ${before} | ${after} | ${text} | ${verdict} |`);
    }
  }
  return [...rows, ...runtimeRows({ baseline, candidate, band })];
}

function k6Summary(directory, flow) {
  const path = join(directory, `${flow}.json`);
  if (!existsSync(path)) throw new Error(`${path} is missing: run the flow with --save-as first`);
  return readJson(path);
}

function compareMarkdown({ flow, baselineDirectory, candidateDirectory, band }) {
  const lines = [
    `## ${flow}: ${baselineDirectory} → ${candidateDirectory}`,
    '',
    `Noise band ±${band}%: identical runs differ by about that much, so only a change beyond it counts.`,
    '',
    '| Scenario | Metric | Baseline | Candidate | Change | Verdict |',
    '| --- | --- | --- | --- | --- | --- |',
    ...k6Rows({
      baseline: k6Summary(baselineDirectory, flow),
      candidate: k6Summary(candidateDirectory, flow),
      band,
    }),
    '',
  ];
  const baselineBackend = join(baselineDirectory, `${flow}.backend.json`);
  const candidateBackend = join(candidateDirectory, `${flow}.backend.json`);
  if (existsSync(baselineBackend) && existsSync(candidateBackend)) {
    lines.push(
      '| Handler | Metric | Baseline | Candidate | Change | Verdict |',
      '| --- | --- | --- | --- | --- | --- |',
      ...backendRows({
        baseline: readJson(baselineBackend),
        candidate: readJson(candidateBackend),
        band,
      }),
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
  const [baselineDirectory, candidateDirectory, flow] = positionals;
  if (!flow)
    throw new Error(
      'usage: node load/compare.mjs <baseline directory> <candidate directory> <flow> [--band 20]',
    );
  console.log(
    compareMarkdown({ flow, baselineDirectory, candidateDirectory, band: Number(values.band) }),
  );
}
