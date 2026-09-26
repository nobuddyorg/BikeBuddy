'use strict';

// Usage: node scripts/backfillStoredBytes.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const blobStorage = require('../src/lib/blobStorage');
const { runStoredBytesBackfill } = require('./lib/storedBytesBackfill');

runStoredBytesBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({
    toursContainer: db.toursContainer(),
    gpxContainer: await blobStorage.gpxContainer(),
    imagesContainer: await blobStorage.imagesContainer(),
  }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
