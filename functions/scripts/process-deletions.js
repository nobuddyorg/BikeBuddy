'use strict';

// Usage: node scripts/process-deletions.js [--dry-run]; a missing env variable is named on start.

const { deletionsContainer } = require('../src/lib/db');
const { runDeletionJob } = require('./lib/deletionJob');

runDeletionJob({
  argv: process.argv.slice(2),
  environment: process.env,
  fetch: globalThis.fetch,
  openDeletionsContainer: deletionsContainer,
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
