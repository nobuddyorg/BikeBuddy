'use strict';

// Usage: node scripts/backfillTourStats.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const blobStorage = require('../src/lib/blobStorage');
const { runTourStatsBackfill } = require('./lib/tourStatsBackfill');

runTourStatsBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({
    toursContainer: db.toursContainer(),
    gpxContainer: await blobStorage.gpxContainer(),
  }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
