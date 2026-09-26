// Usage: node load/backend-report.mjs <flow> --log /tmp/func.log [--from <byte offset>] [--cpu load-results/cpu]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const PREFIX = 'LOADPROF ';
const TOP_FUNCTIONS = 15;
const NO_CPU_PROFILE = { files: 0, totalMs: 0, top: [] };
const NO_RUNTIME_SAMPLES = {
  samples: 0,
  loopP99MaxMs: 0,
  loopMaxMs: 0,
  loopP50MedianMs: 0,
  rssMaxMb: 0,
  heapUsedMaxMb: 0,
};

const round = (value, digits = 1) => Number(value.toFixed(digits));
const sum = (values) => values.reduce((total, value) => total + value, 0);

function percentile(values, rank) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((rank / 100) * sorted.length) - 1)];
}

/** LOADPROF records from a host log, in order, and how many LOADPROF lines were not valid JSON. */
export function parseRecords(text) {
  const records = [];
  let unparsableLines = 0;
  for (const line of text.split('\n')) {
    const start = line.indexOf(PREFIX);
    if (start === -1) continue;
    try {
      records.push(JSON.parse(line.slice(start + PREFIX.length)));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      unparsableLines += 1;
    }
  }
  return { records, unparsableLines };
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
  const invocations = records.filter((record) => record.type === 'invocation');
  return [...groupBy(invocations, (record) => record.handler)]
    .map(([handler, rows]) => {
      const durations = rows.map((row) => row.ms);
      return {
        handler,
        calls: rows.length,
        errors: rows.filter((row) => row.status >= 500).length,
        p50Ms: round(percentile(durations, 50)),
        p95Ms: round(percentile(durations, 95)),
        totalMs: round(sum(durations)),
        avgKb: round(sum(rows.map((row) => row.bytes)) / rows.length / 1024),
      };
    })
    .sort((left, right) => right.totalMs - left.totalMs);
}

function cosmosCost(records) {
  const invocations = groupBy(
    records.filter((record) => record.type === 'invocation'),
    (record) => record.handler,
  );
  const cosmosOperations = records.filter((record) => record.type === 'cosmos');
  return [...groupBy(cosmosOperations, (record) => `${record.handler}\u0000${record.op}`)]
    .map(([key, rows]) => {
      const [handler, op] = key.split('\u0000');
      const calls = invocations.get(handler)?.length ?? 0;
      const totalRu = sum(rows.map((row) => row.ru));
      return {
        handler,
        op,
        count: rows.length,
        // null: an operation logged for a handler with no invocation record has no per-request rate.
        perRequest: calls ? round(rows.length / calls, 2) : null,
        totalRu: round(totalRu, 2),
        ruPerRequest: calls ? round(totalRu / calls, 2) : null,
        avgMs: round(sum(rows.map((row) => row.ms)) / rows.length),
      };
    })
    .sort((left, right) => right.totalRu - left.totalRu || right.count - left.count);
}

function blobOperations(records) {
  return [
    ...groupBy(
      records.filter((record) => record.type === 'blob'),
      (record) => `${record.handler}\u0000${record.op}`,
    ),
  ]
    .map(([key, rows]) => {
      const [handler, op] = key.split('\u0000');
      return { handler, op, count: rows.length };
    })
    .sort((left, right) => right.count - left.count);
}

function runtimeSamples(records) {
  const samples = records.filter((record) => record.type === 'sample');
  if (samples.length === 0) return NO_RUNTIME_SAMPLES;
  return {
    samples: samples.length,
    loopP99MaxMs: round(Math.max(...samples.map((sample) => sample.loopP99Ms))),
    loopMaxMs: round(Math.max(...samples.map((sample) => sample.loopMaxMs))),
    loopP50MedianMs: round(
      percentile(
        samples.map((sample) => sample.loopP50Ms),
        50,
      ),
    ),
    rssMaxMb: round(Math.max(...samples.map((sample) => sample.rssMb))),
    heapUsedMaxMb: round(Math.max(...samples.map((sample) => sample.heapUsedMb))),
  };
}

function frameName({ functionName, url, lineNumber }) {
  const location = url
    ? `${url.replace(/^.*\/(node_modules|src)\//, '$1/')}:${lineNumber + 1}`
    : '';
  return `${functionName || '(anonymous)'} ${location}`.trim();
}

/** Top self-time functions across every .cpuprofile in `directory`, which must hold at least one. */
function cpuTop(directory) {
  const files = readdirSync(directory).filter((name) => name.endsWith('.cpuprofile'));
  if (files.length === 0) throw new Error(`${directory} holds no .cpuprofile files`);
  const selfMs = new Map();
  let totalMs = 0;
  for (const file of files) {
    const profile = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    profile.samples.forEach((nodeId, sampleIndex) => {
      const name = frameName(nodes.get(nodeId).callFrame);
      const sampleMs = (profile.timeDeltas[sampleIndex] ?? 0) / 1000;
      selfMs.set(name, (selfMs.get(name) ?? 0) + sampleMs);
      totalMs += sampleMs;
    });
  }
  return {
    files: files.length,
    totalMs: round(totalMs),
    top: [...selfMs]
      .sort((left, right) => right[1] - left[1])
      .slice(0, TOP_FUNCTIONS)
      .map(([name, functionMs]) => ({
        name,
        selfMs: round(functionMs),
        share: round((100 * functionMs) / totalMs),
      })),
  };
}

function buildReport({ records, unparsableLines, cpu }) {
  return {
    unparsableLines,
    handlers: handlerTimings(records),
    cosmos: cosmosCost(records),
    blob: blobOperations(records),
    runtime: runtimeSamples(records),
    cpu,
  };
}

const table = (headers, rows) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
];

function unparsableWarning(report) {
  if (report.unparsableLines === 0) return [];
  return [
    `⚠️ ${report.unparsableLines} LOADPROF line(s) in the host log were not valid JSON and are left out of every table below.`,
    '',
  ];
}

function handlerSection(report) {
  return [
    '### Handler timings (server side)',
    '',
    ...table(
      ['Handler', 'Calls', '5xx', 'p50', 'p95', 'Total', 'Avg response'],
      report.handlers.map((handler) => [
        handler.handler,
        handler.calls,
        handler.errors,
        `${handler.p50Ms} ms`,
        `${handler.p95Ms} ms`,
        `${handler.totalMs} ms`,
        `${handler.avgKb} KB`,
      ]),
    ),
    '',
  ];
}

function cosmosSection(report) {
  return [
    '### Cosmos operations per handler',
    '',
    'Per request = operations per invocation of that handler (more than one on a list endpoint is an N+1 smell). RU as reported by the target; the vnext emulator reports nominal charges.',
    '',
    ...table(
      ['Handler', 'Operation', 'Count', 'Per request', 'RU total', 'RU per request', 'Avg ms'],
      report.cosmos.map((operation) => [
        operation.handler,
        operation.op,
        operation.count,
        operation.perRequest ?? '—',
        operation.totalRu,
        operation.ruPerRequest ?? '—',
        operation.avgMs,
      ]),
    ),
    '',
  ];
}

function blobSection(report) {
  if (report.blob.length === 0) return [];
  return [
    '### Blob Storage operations',
    '',
    ...table(
      ['Handler', 'Operation', 'Count'],
      report.blob.map((operation) => [operation.handler, operation.op, operation.count]),
    ),
    '',
  ];
}

function runtimeSection({ runtime }) {
  if (runtime.samples === 0) return [];
  return [
    '### Worker runtime',
    '',
    `Event-loop delay: median p50 ${runtime.loopP50MedianMs} ms, worst p99 ${runtime.loopP99MaxMs} ms, max ${runtime.loopMaxMs} ms (${runtime.samples} samples, 5 s apart). Memory: RSS up to ${runtime.rssMaxMb} MB, heap up to ${runtime.heapUsedMaxMb} MB.`,
    '',
  ];
}

function cpuSection({ cpu }) {
  if (cpu.files === 0) return [];
  return [
    `### CPU profile: top ${cpu.top.length} functions by self time`,
    '',
    `${cpu.files} profile(s), ${cpu.totalMs} ms sampled. Open the \`.cpuprofile\` files in Chrome DevTools or speedscope for the flame graph.`,
    '',
    ...table(
      ['Function', 'Self', 'Share'],
      cpu.top.map((entry) => [`\`${entry.name}\``, `${entry.selfMs} ms`, `${entry.share}%`]),
    ),
    '',
  ];
}

function reportMarkdown({ title, report }) {
  const heading = [`## Backend report: ${title}`, '', ...unparsableWarning(report)];
  if (report.handlers.length === 0) {
    return [
      ...heading,
      'No LOADPROF records: the Functions host did not run with LOAD_PROFILING=true (see docs/how-to/load-testing.md).',
      '',
    ].join('\n');
  }
  return [
    ...heading,
    ...handlerSection(report),
    ...cosmosSection(report),
    ...blobSection(report),
    ...runtimeSection(report),
    ...cpuSection(report),
  ].join('\n');
}

/** Writes <flow>.backend.md and .backend.json; `cpuDirectory` is optional and must hold profiles when given. */
export function writeReport({
  flow,
  title,
  parsedLog,
  cpuDirectory = '',
  directory = 'load-results',
}) {
  const cpu = cpuDirectory ? cpuTop(cpuDirectory) : NO_CPU_PROFILE;
  const report = buildReport({ ...parsedLog, cpu });
  const markdown = reportMarkdown({ title, report });
  writeFileSync(join(directory, `${flow}.backend.md`), markdown);
  writeFileSync(join(directory, `${flow}.backend.json`), JSON.stringify(report, null, 2));
  return markdown;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      log: { type: 'string', default: process.env.FUNCTIONS_HOST_LOG ?? '/tmp/func.log' },
      from: { type: 'string', default: '0' },
      cpu: { type: 'string', default: '' },
    },
  });
  const [flow] = positionals;
  if (!flow)
    throw new Error(
      'usage: node load/backend-report.mjs <flow> --log <file> [--from <offset>] [--cpu <directory>]',
    );
  const text = readFileSync(values.log).subarray(Number(values.from)).toString('utf8');
  console.log(
    writeReport({
      flow,
      title: `\`${flow}\``,
      parsedLog: parseRecords(text),
      cpuDirectory: values.cpu,
    }),
  );
}
