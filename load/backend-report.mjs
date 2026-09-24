// What the Functions host did during a load run, from the LOADPROF lines that
// functions/src/lib/profiling.js writes (LOAD_PROFILING=true) and, when given, the
// worker's --cpu-prof profiles. docs/how-to/load-testing.md, "Backend report".
//   node load/backend-report.mjs <flow> --log /tmp/func.log [--from <byte offset>] [--cpu load-results/cpu]
// Writes load-results/<flow>.backend.md and .backend.json. Importable: run.mjs
// calls buildReport() with the log slice of its own run.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const PREFIX = 'LOADPROF ';
const TOP_FUNCTIONS = 15;

const round = (value, digits = 1) => Number(value.toFixed(digits));
const sum = (values) => values.reduce((total, value) => total + value, 0);

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** LOADPROF records from a host log (text), in order. */
export function parseRecords(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const at = line.indexOf(PREFIX);
    if (at === -1) continue;
    try {
      records.push(JSON.parse(line.slice(at + PREFIX.length)));
    } catch {
      // A line the host split or truncated; one lost record does not change the picture.
    }
  }
  return records;
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const name = key(record);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }
  return groups;
}

function handlerTimings(records) {
  const invocations = records.filter((r) => r.type === 'invocation');
  return [...groupBy(invocations, (r) => r.handler)]
    .map(([handler, rows]) => {
      const ms = rows.map((r) => r.ms);
      return {
        handler,
        calls: rows.length,
        errors: rows.filter((r) => r.status >= 500).length,
        p50Ms: round(percentile(ms, 50)),
        p95Ms: round(percentile(ms, 95)),
        totalMs: round(sum(ms)),
        avgKb: round(sum(rows.map((r) => r.bytes)) / rows.length / 1024),
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);
}

function cosmosCost(records) {
  const invocations = groupBy(
    records.filter((r) => r.type === 'invocation'),
    (r) => r.handler,
  );
  const ops = records.filter((r) => r.type === 'cosmos');
  return [...groupBy(ops, (r) => `${r.handler}\u0000${r.op}`)]
    .map(([key, rows]) => {
      const [handler, op] = key.split('\u0000');
      const calls = invocations.get(handler)?.length ?? 0;
      return {
        handler,
        op,
        count: rows.length,
        perRequest: calls ? round(rows.length / calls, 2) : null,
        totalRu: round(sum(rows.map((r) => r.ru)), 2),
        ruPerRequest: calls ? round(sum(rows.map((r) => r.ru)) / calls, 2) : null,
        avgMs: round(sum(rows.map((r) => r.ms)) / rows.length),
      };
    })
    .sort((a, b) => b.totalRu - a.totalRu || b.count - a.count);
}

function blobOps(records) {
  return [
    ...groupBy(
      records.filter((r) => r.type === 'blob'),
      (r) => `${r.handler}\u0000${r.op}`,
    ),
  ]
    .map(([key, rows]) => {
      const [handler, op] = key.split('\u0000');
      return { handler, op, count: rows.length };
    })
    .sort((a, b) => b.count - a.count);
}

function runtimeSamples(records) {
  const samples = records.filter((r) => r.type === 'sample');
  if (samples.length === 0) return null;
  return {
    samples: samples.length,
    loopP99MaxMs: round(Math.max(...samples.map((s) => s.loopP99Ms))),
    loopMaxMs: round(Math.max(...samples.map((s) => s.loopMaxMs))),
    loopP50MedianMs: round(
      percentile(
        samples.map((s) => s.loopP50Ms),
        50,
      ),
    ),
    rssMaxMb: round(Math.max(...samples.map((s) => s.rssMb))),
    heapUsedMaxMb: round(Math.max(...samples.map((s) => s.heapUsedMb))),
  };
}

/** Top self-time functions across every .cpuprofile in `directory`. */
export function cpuTop(directory, top = TOP_FUNCTIONS) {
  let files;
  try {
    files = readdirSync(directory).filter((name) => name.endsWith('.cpuprofile'));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  const selfMs = new Map();
  let totalMs = 0;
  for (const file of files) {
    const profile = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    profile.samples.forEach((id, i) => {
      const { functionName, url, lineNumber } = nodes.get(id).callFrame;
      const name =
        `${functionName || '(anonymous)'} ${url ? `${url.replace(/^.*\/(node_modules|src)\//, '$1/')}:${lineNumber + 1}` : ''}`.trim();
      const ms = (profile.timeDeltas[i] ?? 0) / 1000;
      selfMs.set(name, (selfMs.get(name) ?? 0) + ms);
      totalMs += ms;
    });
  }
  return {
    files: files.length,
    totalMs: round(totalMs),
    top: [...selfMs]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([name, ms]) => ({ name, selfMs: round(ms), share: round((100 * ms) / totalMs) })),
  };
}

export function buildReport(records, cpu = null) {
  return {
    handlers: handlerTimings(records),
    cosmos: cosmosCost(records),
    blob: blobOps(records),
    runtime: runtimeSamples(records),
    cpu,
  };
}

const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
];

export function reportMarkdown(title, report) {
  const lines = [`## Backend report: ${title}`, ''];
  if (report.handlers.length === 0) {
    lines.push(
      'No LOADPROF records: the Functions host did not run with LOAD_PROFILING=true (see docs/how-to/load-testing.md).',
      '',
    );
    return lines.join('\n');
  }
  lines.push(
    '### Handler timings (server side)',
    '',
    ...table(
      ['Handler', 'Calls', '5xx', 'p50', 'p95', 'Total', 'Avg response'],
      report.handlers.map((h) => [
        h.handler,
        h.calls,
        h.errors,
        `${h.p50Ms} ms`,
        `${h.p95Ms} ms`,
        `${h.totalMs} ms`,
        `${h.avgKb} KB`,
      ]),
    ),
    '',
    '### Cosmos operations per handler',
    '',
    'Per request = operations per invocation of that handler (more than one on a list endpoint is an N+1 smell). RU as reported by the target; the vnext emulator reports nominal charges.',
    '',
    ...table(
      ['Handler', 'Operation', 'Count', 'Per request', 'RU total', 'RU per request', 'Avg ms'],
      report.cosmos.map((c) => [
        c.handler,
        c.op,
        c.count,
        c.perRequest ?? '—',
        c.totalRu,
        c.ruPerRequest ?? '—',
        c.avgMs,
      ]),
    ),
    '',
  );
  if (report.blob.length > 0) {
    lines.push(
      '### Blob Storage operations',
      '',
      ...table(
        ['Handler', 'Operation', 'Count'],
        report.blob.map((b) => [b.handler, b.op, b.count]),
      ),
      '',
    );
  }
  if (report.runtime) {
    const r = report.runtime;
    lines.push(
      '### Worker runtime',
      '',
      `Event-loop delay: median p50 ${r.loopP50MedianMs} ms, worst p99 ${r.loopP99MaxMs} ms, max ${r.loopMaxMs} ms (${r.samples} samples, 5 s apart). Memory: RSS up to ${r.rssMaxMb} MB, heap up to ${r.heapUsedMaxMb} MB.`,
      '',
    );
  }
  if (report.cpu) {
    lines.push(
      `### CPU profile: top ${report.cpu.top.length} functions by self time`,
      '',
      `${report.cpu.files} profile(s), ${report.cpu.totalMs} ms sampled. Open the \`.cpuprofile\` files in Chrome DevTools or speedscope for the flame graph.`,
      '',
      ...table(
        ['Function', 'Self', 'Share'],
        report.cpu.top.map((f) => [`\`${f.name}\``, `${f.selfMs} ms`, `${f.share}%`]),
      ),
      '',
    );
  }
  return lines.join('\n');
}

export function writeReport({ flow, title, records, cpuDirectory, directory = 'load-results' }) {
  const report = buildReport(records, cpuDirectory ? cpuTop(cpuDirectory) : null);
  const markdown = reportMarkdown(title, report);
  writeFileSync(join(directory, `${flow}.backend.md`), markdown);
  writeFileSync(join(directory, `${flow}.backend.json`), JSON.stringify(report, null, 2));
  return markdown;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      log: { type: 'string', default: process.env.FUNC_LOG ?? '/tmp/func.log' },
      from: { type: 'string', default: '0' },
      cpu: { type: 'string' },
    },
  });
  const [flow] = positionals;
  if (!flow)
    throw new Error(
      'usage: node load/backend-report.mjs <flow> --log <file> [--from <offset>] [--cpu <dir>]',
    );
  const text = readFileSync(values.log).subarray(Number(values.from)).toString('utf8');
  console.log(
    writeReport({
      flow,
      title: `\`${flow}\``,
      records: parseRecords(text),
      cpuDirectory: values.cpu,
    }),
  );
}
