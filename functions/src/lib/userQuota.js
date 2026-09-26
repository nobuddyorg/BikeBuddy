// @ts-check
'use strict';

const db = require('./db');
const { ERROR_KEYS, error } = require('./http');

// Per rider (#549): far above a personal ride log, far below what a script could run up.
const MAX_TOURS_PER_USER = 1000;
const MAX_STORED_BYTES_PER_USER = 5 * 1024 ** 3;

// Only the sizes: one small query per upload, in the caller's partition.
const USAGE_QUERY = 'SELECT c.gpxBytes, c.images FROM c WHERE c.userId = @userId';

// Sizes written before #549 count as nothing until scripts/backfillStoredBytes.js fills them in.
const sizeOf = (value) => (typeof value === 'number' ? value : 0);
const storedBytesOf = (tour) =>
  sizeOf(tour.gpxBytes) + (tour.images?.reduce((sum, image) => sum + sizeOf(image.bytes), 0) ?? 0);

/**
 * What a rider stores, summed from the sizes on each tour and photo entry: a delete frees its
 * bytes with the entry, so nothing can drift.
 *
 * @param {{ gpxBytes?: unknown, images?: { bytes?: unknown }[] }[]} tours
 */
const usageOf = (tours) => ({
  tourCount: tours.length,
  storedBytes: tours.reduce((sum, tour) => sum + storedBytesOf(tour), 0),
});

/**
 * @param {{ tourCount: number, storedBytes: number }} usage
 * @param {{ tours: number, bytes: number }} adding
 * @returns {string} the error key refusing the addition, or '' when it fits
 */
function quotaRefusal(usage, adding) {
  if (usage.tourCount + adding.tours > MAX_TOURS_PER_USER) return ERROR_KEYS.tourLimit;
  if (usage.storedBytes + adding.bytes > MAX_STORED_BYTES_PER_USER) return ERROR_KEYS.storageLimit;
  return '';
}

/**
 * Concurrent uploads each see the usage before the others, so a burst can pass the caps by a few;
 * the upload rate limit bounds by how much.
 *
 * @param {{ userId: string, toursContainer: () => any, adding: { tours: number, bytes: number } }} request
 * @returns {Promise<object | null>} the response to send, or null to carry on
 */
async function refuseOverQuota({ userId, toursContainer, adding }) {
  const tours = await db.queryUserItems(toursContainer(), { userId, query: USAGE_QUERY });
  const refusal = quotaRefusal(usageOf(tours), adding);
  return refusal ? error(400, refusal) : null;
}

module.exports = {
  MAX_TOURS_PER_USER,
  MAX_STORED_BYTES_PER_USER,
  usageOf,
  quotaRefusal,
  refuseOverQuota,
};
