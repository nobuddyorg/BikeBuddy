// @ts-check
'use strict';

const db = require('./db');
const { TRACK_SCHEMA_VERSION } = require('./schemaVersion');

const TRACK_POINTS_QUERY = 'SELECT c.id, c.heatmapData FROM c WHERE c.userId = @userId';
// Tours from before #615 keep their points inline until scripts/backfillTracks.js moves them.
const INLINE_POINTS_QUERY =
  'SELECT c.id, c.heatmapData FROM c WHERE c.userId = @userId AND IS_DEFINED(c.heatmapData)';

/** A tour's points, stored apart from it in the rider's partition under the tour's id (#615). */
const newTrackDocument = ({ tourId, userId, heatmapData }) => ({
  id: tourId,
  userId,
  schemaVersion: TRACK_SCHEMA_VERSION,
  heatmapData,
});

/** The points of a tour loaded through loadOwnedTour; `userId` is the token's. */
async function readTourPoints({ tour, userId, tracksContainer }) {
  if (Array.isArray(tour.heatmapData)) return tour.heatmapData;
  const track = await db.readItem(tracksContainer(), { id: tour.id, partitionKey: userId });
  return track?.heatmapData ?? [];
}

/**
 * Every tour's points by tour id: one query on the tracks, one for tours still holding theirs.
 *
 * @returns {Promise<Map<string, [number, number][]>>}
 */
async function readPointsByTour({ userId, toursContainer, tracksContainer }) {
  const [tracks, inline] = await Promise.all([
    db.queryUserItems(tracksContainer(), { userId, query: TRACK_POINTS_QUERY }),
    db.queryUserItems(toursContainer(), { userId, query: INLINE_POINTS_QUERY }),
  ]);
  return new Map([...tracks, ...inline].map((item) => [item.id, item.heatmapData ?? []]));
}

module.exports = { newTrackDocument, readTourPoints, readPointsByTour };
