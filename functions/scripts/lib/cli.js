'use strict';

const { parseArgs } = require('node:util');

function requireEnvironment(environment, names) {
  const missing = names.filter((name) => !environment[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, environment[name]]));
}

// Strict: a mistyped flag must stop the run, never fall through to a real one.
function parseFlags(argv, flagNames) {
  const options = Object.fromEntries(flagNames.map((name) => [name, { type: 'boolean' }]));
  const { values } = parseArgs({ args: argv, options, strict: true, allowPositionals: false });
  return Object.fromEntries(flagNames.map((name) => [name, values[name] === true]));
}

// A backfill writes only when asked to with --apply.
function isBackfillDryRun(argv) {
  const flags = parseFlags(argv, ['dry-run', 'apply']);
  if (flags['dry-run'] && flags.apply)
    throw new Error('Pass either --dry-run or --apply, not both');
  return !flags.apply;
}

async function exitCodeOf({ job, log }) {
  try {
    const succeeded = await job();
    return succeeded ? 0 : 1;
  } catch (error) {
    log.error(error);
    return 1;
  }
}

const BACKFILL_ENVIRONMENT = [
  'COSMOS_CONNECTION_STRING',
  'COSMOS_DATABASE',
  'BLOB_CONNECTION_STRING',
];

// Resolves to the process exit code: non-zero when any item failed.
function runBackfill({ argv, environment, openContainers, log, plan, apply }) {
  return exitCodeOf({
    log,
    job: async () => {
      const backfill = isBackfillDryRun(argv) ? plan : apply;
      requireEnvironment(environment, BACKFILL_ENVIRONMENT);
      const { failed } = await backfill({ ...(await openContainers()), log });
      return failed === 0;
    },
  });
}

module.exports = { requireEnvironment, parseFlags, exitCodeOf, runBackfill };
