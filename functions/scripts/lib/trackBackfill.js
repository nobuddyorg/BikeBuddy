'use strict';

const { newTrackDocument } = require('../../src/lib/tourTrack');
const { TOUR_SCHEMA_VERSION } = require('../../src/lib/schemaVersion');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

// Version 1 (images and stats), which schemaVersionBackfill.js marks; moving the track makes it 2.
const STATS_SCHEMA_VERSION = 1;

// A tour still holding its points, or one moved before the schema-version backfill marked it.
const PENDING_TOURS_QUERY =
  'SELECT c.id, c.userId, c.schemaVersion, c.heatmapData FROM c ' +
  `WHERE IS_DEFINED(c.heatmapData) OR c.schemaVersion = ${STATS_SCHEMA_VERSION}`;

const inlinePoints = (tour) => (Array.isArray(tour.heatmapData) ? tour.heatmapData : []);

/** The patch that leaves a tour as UploadTour writes it now: its points counted, not held (#615). */
function tourOperations(tour) {
  return [
    ...('heatmapData' in tour
      ? [
          { op: 'set', path: '/pointCount', value: inlinePoints(tour).length },
          { op: 'remove', path: '/heatmapData' },
        ]
      : []),
    ...(tour.schemaVersion === STATS_SCHEMA_VERSION
      ? [{ op: 'set', path: '/schemaVersion', value: TOUR_SCHEMA_VERSION }]
      : []),
  ];
}

const describeChange = (tour) =>
  'heatmapData' in tour
    ? `move the track of tour ${tour.id} (${inlinePoints(tour).length} points)`
    : `mark tour ${tour.id} as version ${TOUR_SCHEMA_VERSION}`;

async function forEachPendingTour({ toursContainer, log, handleTour }) {
  const tally = { changed: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, PENDING_TOURS_QUERY)) {
    try {
      await handleTour(tour);
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planTrackBackfill({ toursContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    log,
    handleTour: async (tour) => log.info(`Would ${describeChange(tour)}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would change, ${tally.failed} failed.`,
  );
  return tally;
}

// The track first: a failure between the two writes leaves the points in both places, never none.
async function applyTrackBackfill({ toursContainer, tracksContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    log,
    handleTour: async (tour) => {
      if ('heatmapData' in tour) {
        await tracksContainer.items.upsert(
          newTrackDocument({
            tourId: tour.id,
            userId: tour.userId,
            heatmapData: inlinePoints(tour),
          }),
        );
      }
      await toursContainer.item(tour.id, tour.userId).patch(tourOperations(tour));
      log.info(`Done: ${describeChange(tour)}`);
    },
  });
  log.info(`Done: ${tally.changed} tour(s) changed, ${tally.failed} failed.`);
  return tally;
}

function runTrackBackfill(options) {
  return runBackfill({ ...options, plan: planTrackBackfill, apply: applyTrackBackfill });
}

module.exports = { tourOperations, planTrackBackfill, applyTrackBackfill, runTrackBackfill };
