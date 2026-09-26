'use strict';

// Usage: node scripts/backfillSchemaVersion.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const { runSchemaVersionBackfill } = require('./lib/schemaVersionBackfill');

runSchemaVersionBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({ toursContainer: db.toursContainer() }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
