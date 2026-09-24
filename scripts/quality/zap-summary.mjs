// A ZAP report_json.json as a markdown table, applying the pass's rules file:
//   node scripts/quality/zap-summary.mjs --title '<heading>' --rules .zap/rules-api.tsv <report_json.json>
// Appends to $GITHUB_STEP_SUMMARY in CI, prints otherwise.
import { appendFile, readFile } from 'node:fs/promises';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** `{ [pluginId]: { threshold, reason } }` from the tsv's non-comment lines. */
function parseRules(tsv) {
  const rules = {};
  for (const line of tsv.split('\n')) {
    const match = /^(\d+)\t(FAIL|WARN|INFO|IGNORE)\t#\s*(.*)$/.exec(line);
    if (match) rules[match[1]] = { threshold: match[2], reason: match[3] };
  }
  return rules;
}

// Informational alerts are listed but never counted.
function verdict(alert, rules) {
  if (alert.riskcode === '0') return { label: 'info', counted: false };
  const rule = rules[alert.pluginid];
  if (rule?.threshold === 'IGNORE') return { label: `ignored: ${rule.reason}`, counted: false };
  if (rule?.threshold === 'FAIL') return { label: '❌ FAIL', counted: true };
  return { label: '⚠️ WARN', counted: true };
}

const title = argument('--title') ?? 'OWASP ZAP scan';
const reportPath = process.argv.at(-1);
const [report, tsv] = await Promise.all([
  readFile(reportPath, 'utf8').then(JSON.parse),
  readFile(argument('--rules'), 'utf8'),
]);
const rules = parseRules(tsv);
const rows = report.site
  .flatMap((site) => site.alerts)
  .map((alert) => ({ alert, ...verdict(alert, rules) }));
const open = rows.filter((row) => row.counted).length;

const markdown = [
  `## ${title}`,
  '',
  open === 0
    ? '✅ No warning or failing alerts outside the documented ignores.'
    : `⚠️ ${open} alert(s) at WARN or FAIL (only FAIL blocks).`,
  '',
  '| Alert | Risk (confidence) | Instances | Verdict |',
  '|---|---|---|---|',
  ...rows.map(
    ({ alert, label }) => `| ${alert.name} | ${alert.riskdesc} | ${alert.count} | ${label} |`,
  ),
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
else process.stdout.write(markdown);
