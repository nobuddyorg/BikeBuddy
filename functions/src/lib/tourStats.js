// @ts-check
'use strict';

// Stored field → the parsed track's field.
const STAT_SOURCES = {
  distance: 'distanceKm',
  elevationGain: 'elevationGain',
  elevationLoss: 'elevationLoss',
  minElevation: 'minElevation',
  maxElevation: 'maxElevation',
  durationSeconds: 'durationSeconds',
  movingSeconds: 'movingSeconds',
  avgSpeed: 'avgSpeed',
};
const STORED_STAT_FIELDS = Object.keys(STAT_SOURCES);

/**
 * The stats a tour document stores, from a parsed GPX track: UploadTour writes them, and the stats
 * backfill recomputes them for older tours.
 *
 * @param {Record<string, unknown>} track
 */
function storedTrackStats(track) {
  return Object.fromEntries(STORED_STAT_FIELDS.map((field) => [field, track[STAT_SOURCES[field]]]));
}

module.exports = { STORED_STAT_FIELDS, storedTrackStats };
