// Usage: node load/run.mjs <flow> [--profile normal|peak|stress] [--save-as <label>]
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
    'save-as': { type: 'string' },
  },
});
const [flow] = positionals;
if (!FLOWS.includes(flow)) fail(`Pick a flow: ${FLOWS.join(', ')}`);
if (!PROFILES.includes(values.profile)) fail(`--profile must be one of ${PROFILES.join(', ')}`);

// Load tests never run against the live app; only the local stack.
const apiUrl = process.env.LOAD_API_URL || 'http://127.0.0.1:7071';
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(apiUrl)) {
  fail(`Load tests run only against the local stack; refusing LOAD_API_URL ${apiUrl}`);
}

// k6 writes the files handleSummary names but does not create their directory.
mkdirSync(`${root}load-results`, { recursive: true });

// This run's slice of the Functions host log (start-backend writes it) becomes the backend report.
const functionsHostLog = process.env.FUNCTIONS_HOST_LOG ?? '/tmp/func.log';
const logOffset = existsSync(functionsHostLog) ? statSync(functionsHostLog).size : 0;

console.log(`k6 ${flow}, ${values.profile} profile, against the local stack (${apiUrl})`);
const { status } = spawnSync('k6', ['run', '--out', 'web-dashboard', `load/${flow}.js`], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    LOAD_API_URL: apiUrl,
    LOAD_PROFILE: values.profile,
    K6_NO_USAGE_REPORT: 'true',
    // Port -1: no live dashboard for k6 to wait on; the HTML export is enough.
    K6_WEB_DASHBOARD_PORT: '-1',
    K6_WEB_DASHBOARD_EXPORT: `load-results/${flow}.html`,
  },
});

if (existsSync(functionsHostLog)) {
  const text = readFileSync(functionsHostLog).subarray(logOffset).toString('utf8');
  const cpuDirectory = `${root}load-results/cpu`;
  console.log(
    writeReport({
      flow,
      title: `\`${flow}\`, \`${values.profile}\` profile`,
      parsedLog: parseRecords(text),
      cpuDirectory: existsSync(cpuDirectory) ? cpuDirectory : '',
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
