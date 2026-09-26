'use strict';

// Usage: node scripts/backfillTracks.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const { runTrackBackfill } = require('./lib/trackBackfill');

runTrackBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({
    toursContainer: db.toursContainer(),
    tracksContainer: db.tracksContainer(),
  }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
