'use strict';

const { parseGpx } = require('../../src/lib/parseGpx');
const { gpxBlobName } = require('../../src/lib/blobNames');
const { STORED_STAT_FIELDS, storedTrackStats } = require('../../src/lib/tourStats');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

// Every tour: one from before the stats lacks them, one from before #552 counted the gaps.
const STORED_STAT_COLUMNS = STORED_STAT_FIELDS.map((field) => `c.${field}`).join(', ');
const TOURS_QUERY = `SELECT c.id, c.userId, ${STORED_STAT_COLUMNS} FROM c`;

/** Only the fields whose stored value differs from the GPX; none for an up-to-date tour. */
function statPatchOperations({ stored, parsed }) {
  const recomputed = storedTrackStats(parsed);
  return STORED_STAT_FIELDS.filter((field) => stored[field] !== recomputed[field]).map((field) => ({
    op: 'set',
    path: `/${field}`,
    value: recomputed[field],
  }));
}

async function readStats({ tour, gpxContainer }) {
  const gpxBlob = gpxContainer.getBlockBlobClient(
    gpxBlobName({ userId: tour.userId, tourId: tour.id }),
  );
  return parseGpx(await gpxBlob.downloadToBuffer());
}

const fieldsOf = (operations) => operations.map(({ path }) => path.slice(1)).join(', ');

async function forEachChangedTour({ toursContainer, gpxContainer, log, handleTour }) {
  const tally = { changed: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, TOURS_QUERY)) {
    try {
      const parsed = await readStats({ tour, gpxContainer });
      const operations = statPatchOperations({ stored: tour, parsed });
      if (operations.length === 0) continue;
      await handleTour(tour, operations);
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planTourStatsBackfill({ toursContainer, gpxContainer, log }) {
  const tally = await forEachChangedTour({
    toursContainer,
    gpxContainer,
    log,
    handleTour: async (tour, operations) =>
      log.info(`Would set ${fieldsOf(operations)} on tour ${tour.id}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would be backfilled, ${tally.failed} failed.`,
  );
  return tally;
}

async function applyTourStatsBackfill({ toursContainer, gpxContainer, log }) {
  const tally = await forEachChangedTour({
    toursContainer,
    gpxContainer,
    log,
    handleTour: async (tour, operations) => {
      await toursContainer.item(tour.id, tour.userId).patch(operations);
      log.info(`Set ${fieldsOf(operations)} on tour ${tour.id}`);
    },
  });
  log.info(`Done: ${tally.changed} tour(s) backfilled, ${tally.failed} failed.`);
  return tally;
}

function runTourStatsBackfill(options) {
  return runBackfill({ ...options, plan: planTourStatsBackfill, apply: applyTourStatsBackfill });
}

module.exports = {
  statPatchOperations,
  planTourStatsBackfill,
  applyTourStatsBackfill,
  runTourStatsBackfill,
};
