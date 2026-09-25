import { describe, expect, it } from 'vitest';

import { REPORT_PATH, buildSummary } from './mutationSummary.mjs';

function mutant(id, status) {
  return {
    id,
    mutatorName: 'BooleanLiteral',
    replacement: 'false',
    status,
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
  };
}

function reportFile(statuses) {
  return {
    language: 'javascript',
    source: 'true;\n',
    mutants: statuses.map((status, index) => mutant(String(index), status)),
  };
}

const REPORT = {
  schemaVersion: '1',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/lib/strong.js': reportFile(['Killed', 'Killed', 'Killed', 'Killed']),
    'src/lib/weak.js': reportFile(['Killed', 'Survived', 'Timeout', 'NoCoverage']),
    'src/lib/empty.js': reportFile(['Ignored']),
    'src/Handler/index.js': reportFile(['Killed', 'Killed', 'Killed', 'Survived']),
    'src/lib/untested.js': reportFile(['Survived']),
  },
};

function summaryOf(readText) {
  return buildSummary({
    title: 'Mutation (functions)',
    artifact: 'report-zip',
    threshold: 75,
    readText,
  });
}

describe('buildSummary', () => {
  it('renders the overall score and one row per file, worst first', async () => {
    const readText = async (path) => {
      expect(path).toBe('reports/mutation/mutation.json');
      return JSON.stringify(REPORT);
    };

    await expect(summaryOf(readText)).resolves.toBe(
      [
        '## 🧬 Mutation (functions) — 69.23% (break threshold: 75%)',
        '',
        '| | File | Score | Killed | Survived | Timeout | No coverage | Ignored |',
        '|---|---|---|---|---|---|---|---|',
        '| ❌ | **All files** | 69.23% | 8 | 3 | 1 | 1 | 1 |',
        '| ➖ | `src/lib/empty.js` | n/a | 0 | 0 | 0 | 0 | 1 |',
        '| ❌ | `src/lib/untested.js` | 0.00% | 0 | 1 | 0 | 0 | 0 |',
        '| ❌ | `src/lib/weak.js` | 50.00% | 1 | 1 | 1 | 1 | 0 |',
        '| ✅ | `src/Handler/index.js` | 75.00% | 3 | 1 | 0 | 0 | 0 |',
        '| ✅ | `src/lib/strong.js` | 100.00% | 4 | 0 | 0 | 0 | 0 |',
        '',
        'Full interactive report: download the `report-zip` workflow artifact.',
        '',
      ].join('\n'),
    );
  });

  it('says so when Stryker wrote no report', async () => {
    const readText = async () => {
      throw Object.assign(new Error('no such file'), { code: 'ENOENT' });
    };

    await expect(summaryOf(readText)).resolves.toBe(
      [
        '## 🧬 Mutation (functions)',
        '',
        `No mutation report found at \`${REPORT_PATH}\`: Stryker likely failed before writing it. Check the mutation step above.`,
        '',
      ].join('\n'),
    );
  });

  it('fails on any other read error', async () => {
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' });

    await expect(summaryOf(async () => Promise.reject(failure))).rejects.toBe(failure);
  });

  it('fails on a report that is not JSON', async () => {
    await expect(summaryOf(async () => '{ truncated')).rejects.toThrow(SyntaxError);
  });
});
