'use strict';

const { parseGpx } = require('../../src/lib/parseGpx');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

const STAT_FIELDS = [
  'elevationGain',
  'elevationLoss',
  'minElevation',
  'maxElevation',
  'durationSeconds',
  'movingSeconds',
  'avgSpeed',
];

// A tour from before the stats lacks elevationGain; a backfilled one holds a number or null.
const PENDING_TOURS_QUERY = 'SELECT c.id, c.userId FROM c WHERE NOT IS_DEFINED(c.elevationGain)';

function statPatchOperations(stats) {
  return STAT_FIELDS.map((field) => ({ op: 'set', path: `/${field}`, value: stats[field] }));
}

async function readStats({ tour, gpxContainer }) {
  const gpxBlob = gpxContainer.getBlockBlobClient(`${tour.userId}/${tour.id}.gpx`);
  return parseGpx(await gpxBlob.downloadToBuffer());
}

async function forEachPendingTour({ toursContainer, gpxContainer, log, handleTour }) {
  const tally = { changed: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, PENDING_TOURS_QUERY)) {
    try {
      await handleTour(tour, statPatchOperations(await readStats({ tour, gpxContainer })));
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planTourStatsBackfill({ toursContainer, gpxContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    log,
    handleTour: async (tour) => log.info(`Would backfill tour ${tour.id}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would be backfilled, ${tally.failed} failed.`,
  );
  return tally;
}

async function applyTourStatsBackfill({ toursContainer, gpxContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    log,
    handleTour: async (tour, operations) => {
      await toursContainer.item(tour.id, tour.userId).patch(operations);
      log.info(`Backfilled tour ${tour.id}`);
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
