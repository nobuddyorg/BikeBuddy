'use strict';

const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

// Version 1 (images and stats); scripts/backfillTracks.js takes a tour from 1 to 2.
const STATS_SCHEMA_VERSION = 1;

// Flags, not the fields: a tour's images and track can be large.
const UNVERSIONED_TOURS_QUERY =
  'SELECT c.id, c.userId, IS_DEFINED(c.images) AS hasImages, ' +
  'IS_DEFINED(c.elevationGain) AS hasStats FROM c WHERE NOT IS_DEFINED(c.schemaVersion)';

// A tour without stats needs backfillTourStats.js first; this one never parses a GPX.
function upgradeOperations({ hasImages }) {
  return [
    ...(hasImages ? [] : [{ op: 'set', path: '/images', value: [] }]),
    { op: 'set', path: '/schemaVersion', value: STATS_SCHEMA_VERSION },
  ];
}

async function forEachUnversionedTour({ toursContainer, log, handleTour }) {
  const tally = { changed: 0, waiting: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, UNVERSIONED_TOURS_QUERY)) {
    if (!tour.hasStats) {
      tally.waiting += 1;
      log.info(`Tour ${tour.id} has no stats yet: run backfillTourStats.js first`);
      continue;
    }
    try {
      await handleTour(tour, upgradeOperations(tour));
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planSchemaVersionBackfill({ toursContainer, log }) {
  const tally = await forEachUnversionedTour({
    toursContainer,
    log,
    handleTour: async (tour) =>
      log.info(`Would mark tour ${tour.id} as version ${STATS_SCHEMA_VERSION}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would be marked, ` +
      `${tally.waiting} wait for the stats backfill, ${tally.failed} failed.`,
  );
  return tally;
}

async function applySchemaVersionBackfill({ toursContainer, log }) {
  const tally = await forEachUnversionedTour({
    toursContainer,
    log,
    handleTour: async (tour, operations) => {
      await toursContainer.item(tour.id, tour.userId).patch(operations);
      log.info(`Marked tour ${tour.id} as version ${STATS_SCHEMA_VERSION}`);
    },
  });
  log.info(
    `Done: ${tally.changed} tour(s) marked, ` +
      `${tally.waiting} wait for the stats backfill, ${tally.failed} failed.`,
  );
  return tally;
}

function runSchemaVersionBackfill(options) {
  return runBackfill({
    ...options,
    plan: planSchemaVersionBackfill,
    apply: applySchemaVersionBackfill,
  });
}

module.exports = {
  upgradeOperations,
  planSchemaVersionBackfill,
  applySchemaVersionBackfill,
  runSchemaVersionBackfill,
};
