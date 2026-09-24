// Stryker's JSON report as a markdown table, scored by mutation-testing-metrics as Stryker's own reporters are.
// Run from the package whose mutation run it reports (functions/ or frontend/):
//   node <path>/mutation-summary.mjs [--title <label>] [--artifact <name>]
// Appends to $GITHUB_STEP_SUMMARY in CI, prints to stdout otherwise.
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

const REPORT_PATH = 'reports/mutation/mutation.json';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const title = argument('--title', 'Mutation testing');
const artifact = argument('--artifact', 'mutation-report');

// Read from the package's own config, so the table and the gate cannot disagree.
async function breakThreshold() {
  const configUrl = pathToFileURL(resolve('stryker.config.mjs')).href;
  const { default: config } = await import(configUrl);
  return config.thresholds.break;
}

function formatScore(score) {
  return Number.isFinite(score) ? `${score.toFixed(2)}%` : 'n/a';
}

function statusIcon(score, threshold) {
  if (!Number.isFinite(score)) return '➖'; // no mutants to score
  return score >= threshold ? '✅' : '❌';
}

function toRow(label, metrics, threshold) {
  return `| ${statusIcon(metrics.mutationScore, threshold)} | ${label} | ${formatScore(metrics.mutationScore)} | ${metrics.killed} | ${metrics.survived} | ${metrics.timeout} | ${metrics.noCoverage} | ${metrics.ignored} |`;
}

function collectFileRows(node, rows) {
  if (node.file) {
    rows.push({ path: node.file.name, metrics: node.metrics });
    return;
  }
  for (const child of node.childResults) collectFileRows(child, rows);
}

const sortableScore = ({ metrics }) =>
  Number.isFinite(metrics.mutationScore) ? metrics.mutationScore : -1;

async function buildSummary() {
  const threshold = await breakThreshold();
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  const { systemUnderTestMetrics: root } = calculateMutationTestMetrics(report);

  const fileRows = [];
  collectFileRows(root, fileRows);
  // Worst score first.
  fileRows.sort((a, b) => sortableScore(a) - sortableScore(b));

  return [
    `## 🧬 ${title} — ${formatScore(root.metrics.mutationScore)} (break threshold: ${threshold}%)`,
    '',
    '| | File | Score | Killed | Survived | Timeout | No coverage | Ignored |',
    '|---|---|---|---|---|---|---|---|',
    toRow('**All files**', root.metrics, threshold),
    ...fileRows.map(({ path, metrics }) => toRow(`\`${path}\``, metrics, threshold)),
    '',
    `Full interactive report: download the \`${artifact}\` workflow artifact.`,
    '',
  ].join('\n');
}

async function main() {
  let summary;
  try {
    summary = await buildSummary();
  } catch (error) {
    console.error('Could not read %s:', REPORT_PATH, error);
    summary = [
      `## 🧬 ${title}`,
      '',
      `No mutation report found at \`${REPORT_PATH}\`: Stryker likely failed before writing it. Check the mutation step above.`,
      '',
    ].join('\n');
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  } else {
    console.log(summary);
  }
}

await main();
