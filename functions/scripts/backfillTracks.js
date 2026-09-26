'use strict';

// Usage: node scripts/backfillTracks.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const blobStorage = require('../src/lib/blobStorage');
const { runTrackBackfill } = require('./lib/trackBackfill');

runTrackBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({
    toursContainer: db.toursContainer(),
    tracksContainer: db.tracksContainer(),
    gpxContainer: await blobStorage.gpxContainer(),
  }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
