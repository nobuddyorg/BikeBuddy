'use strict';

// Usage: node scripts/backfillImageThumbnails.js [--dry-run | --apply]; a dry run is the default.

const db = require('../src/lib/db');
const blobStorage = require('../src/lib/blobStorage');
const { runThumbnailBackfill } = require('./lib/thumbnailBackfill');

runThumbnailBackfill({
  argv: process.argv.slice(2),
  environment: process.env,
  openContainers: async () => ({
    toursContainer: db.toursContainer(),
    imagesContainer: await blobStorage.imagesContainer(),
  }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
