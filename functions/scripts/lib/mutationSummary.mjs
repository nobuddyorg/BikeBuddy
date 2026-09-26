import { calculateMutationTestMetrics } from 'mutation-testing-metrics';

export const REPORT_PATH = 'reports/mutation/mutation.json';

function formatScore(score) {
  return Number.isFinite(score) ? `${score.toFixed(2)}%` : 'n/a';
}

function statusIcon({ score, threshold }) {
  if (!Number.isFinite(score)) return '➖'; // no mutants to score
  return score >= threshold ? '✅' : '❌';
}

function tableRow({ label, metrics, threshold }) {
  const score = metrics.mutationScore;
  const cells = [
    statusIcon({ score, threshold }),
    label,
    formatScore(score),
    metrics.killed,
    metrics.survived,
    metrics.timeout,
    metrics.noCoverage,
    metrics.ignored,
  ];
  return `| ${cells.join(' | ')} |`;
}

function fileResults(node) {
  if (node.file) return [{ path: node.file.name, metrics: node.metrics }];
  return node.childResults.flatMap(fileResults);
}

function sortableScore({ metrics }) {
  return Number.isFinite(metrics.mutationScore) ? metrics.mutationScore : -1;
}

// Scored by mutation-testing-metrics, as Stryker's own reporters score it.
function renderReport({ title, artifact, threshold, report }) {
  const { systemUnderTestMetrics: root } = calculateMutationTestMetrics(report);
  const worstFirst = fileResults(root).sort(
    (first, second) => sortableScore(first) - sortableScore(second),
  );
  return [
    `## 🧬 ${title} — ${formatScore(root.metrics.mutationScore)} (break threshold: ${threshold}%)`,
    '',
    '| | File | Score | Killed | Survived | Timeout | No coverage | Ignored |',
    '|---|---|---|---|---|---|---|---|',
    tableRow({ label: '**All files**', metrics: root.metrics, threshold }),
    ...worstFirst.map(({ path, metrics }) =>
      tableRow({ label: `\`${path}\``, metrics, threshold }),
    ),
    '',
    `Full interactive report: download the \`${artifact}\` workflow artifact.`,
    '',
  ].join('\n');
}

function renderMissingReport(title) {
  return [
    `## 🧬 ${title}`,
    '',
    `No mutation report found at \`${REPORT_PATH}\`: Stryker likely failed before writing it. Check the mutation step above.`,
    '',
  ].join('\n');
}

// Only a missing report is expected (Stryker failed first); any other error fails the step.
export async function buildSummary({ title, artifact, threshold, readText }) {
  let reportText;
  try {
    reportText = await readText(REPORT_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return renderMissingReport(title);
  }
  return renderReport({ title, artifact, threshold, report: JSON.parse(reportText) });
}
