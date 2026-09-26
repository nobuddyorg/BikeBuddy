// @ts-check
'use strict';

const db = require('./db');
const { TRACK_SCHEMA_VERSION } = require('./schemaVersion');

const TRACKS_QUERY = 'SELECT c.id, c.heatmapData, c.segmentStarts FROM c WHERE c.userId = @userId';
// Tours from before #615 keep their points inline until scripts/backfillTracks.js moves them.
const INLINE_POINTS_QUERY =
  'SELECT c.id, c.heatmapData FROM c WHERE c.userId = @userId AND IS_DEFINED(c.heatmapData)';

/** @typedef {{ heatmapData: [number, number][], segmentStarts: number[] }} Track */

/**
 * A tour's points, stored apart from it in the rider's partition under the tour's id (#615), with
 * the index where each segment after the first begins (#552).
 */
const newTrackDocument = ({ tourId, userId, heatmapData, segmentStarts }) => ({
  id: tourId,
  userId,
  schemaVersion: TRACK_SCHEMA_VERSION,
  heatmapData,
  segmentStarts,
});

// Inline points carry no segment boundaries: they are drawn as one line, as they always were.
/** @returns {Track} */
const trackOf = (item) => ({
  heatmapData: item?.heatmapData ?? [],
  segmentStarts: item?.segmentStarts ?? [],
});

/**
 * The track of a tour loaded through loadOwnedTour; `userId` is the token's.
 *
 * @returns {Promise<Track>}
 */
async function readTourTrack({ tour, userId, tracksContainer }) {
  if (Array.isArray(tour.heatmapData)) return trackOf({ heatmapData: tour.heatmapData });
  return trackOf(await db.readItem(tracksContainer(), { id: tour.id, partitionKey: userId }));
}

/**
 * Every tour's track by tour id: one query on the tracks, one for tours still holding theirs.
 *
 * @returns {Promise<Map<string, Track>>}
 */
async function readTracksByTour({ userId, toursContainer, tracksContainer }) {
  const [tracks, inline] = await Promise.all([
    db.queryUserItems(tracksContainer(), { userId, query: TRACKS_QUERY }),
    db.queryUserItems(toursContainer(), { userId, query: INLINE_POINTS_QUERY }),
  ]);
  return new Map([...tracks, ...inline].map((item) => [item.id, trackOf(item)]));
}

module.exports = { newTrackDocument, readTourTrack, readTracksByTour };
