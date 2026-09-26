'use strict';

const { parseGpx, InvalidGpxError } = require('../../src/lib/parseGpx');
const { gpxBlobName } = require('../../src/lib/blobNames');
const { newTrackDocument } = require('../../src/lib/tourTrack');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

// Version 1 (images and stats), which schemaVersionBackfill.js marks; moving the track makes it 2.
const STATS_SCHEMA_VERSION = 1;
const TRACKS_SCHEMA_VERSION = 2;

// A tour still holding its points, or one moved before the schema-version backfill marked it.
const PENDING_TOURS_QUERY =
  'SELECT c.id, c.userId, c.schemaVersion, c.heatmapData FROM c ' +
  `WHERE IS_DEFINED(c.heatmapData) OR c.schemaVersion = ${STATS_SCHEMA_VERSION}`;

const inlinePoints = (tour) => (Array.isArray(tour.heatmapData) ? tour.heatmapData : []);
const isMissingBlob = (error) => error.statusCode === 404;

/**
 * The track as an upload builds it now, from the tour's GPX, segment starts included (#552);
 * without a readable GPX, the inline points as one line.
 */
async function rebuiltTrack({ tour, gpxContainer }) {
  const blob = gpxContainer.getBlockBlobClient(
    gpxBlobName({ userId: tour.userId, tourId: tour.id }),
  );
  try {
    const { heatmapData, segmentStarts } = parseGpx(await blob.downloadToBuffer());
    return { heatmapData, segmentStarts, source: 'its GPX' };
  } catch (error) {
    if (!isMissingBlob(error) && !(error instanceof InvalidGpxError)) throw error;
    return { heatmapData: inlinePoints(tour), segmentStarts: [], source: 'its inline points' };
  }
}

/** The patch that leaves a tour as UploadTour writes it now: its points counted, not held (#615). */
function tourOperations(tour, track) {
  return [
    ...(track
      ? [
          { op: 'set', path: '/pointCount', value: track.heatmapData.length },
          { op: 'remove', path: '/heatmapData' },
        ]
      : []),
    ...(tour.schemaVersion === STATS_SCHEMA_VERSION
      ? [{ op: 'set', path: '/schemaVersion', value: TRACKS_SCHEMA_VERSION }]
      : []),
  ];
}

// Only a tour still holding its points needs a track; one already moved only needs its version.
async function changeFor({ tour, gpxContainer }) {
  const track = 'heatmapData' in tour ? await rebuiltTrack({ tour, gpxContainer }) : undefined;
  const description = track
    ? `move the track of tour ${tour.id} (${track.heatmapData.length} points, ` +
      `${track.segmentStarts.length + 1} segment(s), from ${track.source})`
    : `mark tour ${tour.id} as version ${TRACKS_SCHEMA_VERSION}`;
  return { track, operations: tourOperations(tour, track), description };
}

async function forEachPendingTour({ toursContainer, gpxContainer, log, handleChange }) {
  const tally = { changed: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, PENDING_TOURS_QUERY)) {
    try {
      await handleChange(tour, await changeFor({ tour, gpxContainer }));
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planTrackBackfill({ toursContainer, gpxContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    log,
    handleChange: async (tour, { description }) => log.info(`Would ${description}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would change, ${tally.failed} failed.`,
  );
  return tally;
}

// The track first: a failure between the two writes leaves the points in both places, never none.
async function applyTrackBackfill({ toursContainer, tracksContainer, gpxContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    log,
    handleChange: async (tour, { track, operations, description }) => {
      if (track) {
        const { heatmapData, segmentStarts } = track;
        await tracksContainer.items.upsert(
          newTrackDocument({ tourId: tour.id, userId: tour.userId, heatmapData, segmentStarts }),
        );
      }
      await toursContainer.item(tour.id, tour.userId).patch(operations);
      log.info(`Done: ${description}`);
    },
  });
  log.info(`Done: ${tally.changed} tour(s) changed, ${tally.failed} failed.`);
  return tally;
}

function runTrackBackfill(options) {
  return runBackfill({ ...options, plan: planTrackBackfill, apply: applyTrackBackfill });
}

module.exports = { tourOperations, planTrackBackfill, applyTrackBackfill, runTrackBackfill };
