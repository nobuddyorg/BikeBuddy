// Usage, from the package whose run it reports: node <path>/mutation-summary.mjs [--title <label>] [--artifact <name>]
import { appendFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { buildSummary } from './lib/mutationSummary.mjs';

const { values } = parseArgs({
  options: {
    title: { type: 'string', default: 'Mutation testing' },
    artifact: { type: 'string', default: 'mutation-report' },
  },
  strict: true,
});

// From the package's own Stryker config, so the table and the gate cannot disagree.
const { default: strykerConfig } = await import(pathToFileURL(resolve('stryker.config.mjs')).href);

const summary = await buildSummary({
  title: values.title,
  artifact: values.artifact,
  threshold: strykerConfig.thresholds.break,
  readText: (path) => readFile(path, 'utf8'),
});

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  console.log(summary);
}
