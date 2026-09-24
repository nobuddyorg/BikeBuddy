// Runs one k6 flow from load/ against the local stack or (guarded) production;
// the same command the k6 workflow runs. docs/how-to/load-testing.md.
//   node load/run.mjs <flow> [--profile normal|peak|stress] [--target local-stack|hosted] [--confirm-production]
//                            [--save-as <label>]   (copies load-results/<flow>.* to load-results/<label>/)
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { parseRecords, writeReport } from './backend-report.mjs';

const FLOWS = ['smoke', 'browse', 'upload', 'edit', 'export'];
const PROFILES = ['normal', 'peak', 'stress'];
const root = fileURLToPath(new URL('..', import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: 'string', default: 'normal' },
    target: { type: 'string', default: 'local-stack' },
    'confirm-production': { type: 'boolean', default: false },
    'save-as': { type: 'string' },
  },
});
const [flow] = positionals;
if (!FLOWS.includes(flow)) fail(`Pick a flow: ${FLOWS.join(', ')}`);
if (!PROFILES.includes(values.profile)) fail(`--profile must be one of ${PROFILES.join(', ')}`);

const confirmed = values['confirm-production'];
let apiUrl;
if (values.target === 'local-stack') {
  apiUrl = process.env.LOAD_API_URL ?? 'http://127.0.0.1:7071';
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(apiUrl)) {
    fail(`--target local-stack refuses a non-local LOAD_API_URL (${apiUrl})`);
  }
} else if (values.target === 'hosted') {
  if (!confirmed) fail('--target hosted loads production; add --confirm-production to mean it.');
  apiUrl = process.env.LOAD_API_URL;
  if (!apiUrl || !process.env.LOAD_ACCESS_TOKEN) {
    fail('--target hosted needs LOAD_API_URL and LOAD_ACCESS_TOKEN (the load-test account).');
  }
} else {
  fail(`--target must be local-stack or hosted, not ${values.target}`);
}

// k6 writes the files handleSummary names but does not create their directory.
mkdirSync(`${root}load-results`, { recursive: true });

// The local Functions host's log (start-backend writes it); this run's slice of it
// becomes the backend report when the host runs with LOAD_PROFILING=true.
const funcLog = process.env.FUNC_LOG ?? '/tmp/func.log';
const local = values.target === 'local-stack';
const logOffset = local && existsSync(funcLog) ? statSync(funcLog).size : 0;

console.log(`k6 ${flow}, ${values.profile} profile, against ${values.target} (${apiUrl})`);
const { status } = spawnSync('k6', ['run', '--out', 'web-dashboard', `load/${flow}.js`], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    LOAD_API_URL: apiUrl,
    LOAD_TARGET: values.target,
    LOAD_CONFIRM_PRODUCTION: String(confirmed),
    LOAD_PROFILE: values.profile,
    K6_NO_USAGE_REPORT: 'true',
    // Port -1: no live dashboard for k6 to wait on; the HTML export is enough.
    K6_WEB_DASHBOARD_PORT: '-1',
    K6_WEB_DASHBOARD_EXPORT: `load-results/${flow}.html`,
  },
});

if (local && existsSync(funcLog)) {
  const text = readFileSync(funcLog).subarray(logOffset).toString('utf8');
  const cpuDirectory = `${root}load-results/cpu`;
  console.log(
    writeReport({
      flow,
      title: `\`${flow}\`, \`${values.profile}\` profile`,
      records: parseRecords(text),
      cpuDirectory: existsSync(cpuDirectory) ? cpuDirectory : undefined,
      directory: `${root}load-results`,
    }),
  );
}

if (values['save-as']) {
  const destination = `${root}load-results/${values['save-as']}`;
  mkdirSync(destination, { recursive: true });
  for (const suffix of ['json', 'md', 'html', 'backend.json', 'backend.md']) {
    const file = `${root}load-results/${flow}.${suffix}`;
    if (existsSync(file)) cpSync(file, `${destination}/${flow}.${suffix}`);
  }
  console.log(`Saved to load-results/${values['save-as']}/`);
}
process.exit(status ?? 1);
