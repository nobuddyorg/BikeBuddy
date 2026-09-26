'use strict';

// Usage: node scripts/process-deletions.js [--dry-run]; a missing env variable is named on start.

const db = require('../src/lib/db');
const blobStorage = require('../src/lib/blobStorage');
const { purgeAccountData } = require('../src/lib/accountPurge');
const { runDeletionJob } = require('./lib/deletionJob');

runDeletionJob({
  argv: process.argv.slice(2),
  environment: process.env,
  fetch: globalThis.fetch,
  openDeletionsContainer: db.deletionsContainer,
  openUsersContainer: db.usersContainer,
  purgeAccount: (userId) =>
    purgeAccountData({
      userId,
      toursContainer: db.toursContainer,
      tracksContainer: db.tracksContainer,
      usersContainer: db.usersContainer,
      gpxContainer: blobStorage.gpxContainer,
      imagesContainer: blobStorage.imagesContainer,
    }),
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
