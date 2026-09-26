// @ts-check
'use strict';

// About 75 MB of [lat, lon] arrays (measured): ten riders at the full map budget.
const DEFAULT_MAX_POINTS = 1000000;

// Id and point count stand in for "unchanged": a track is never edited after upload.
function signatureFor(tours) {
  return tours.map((tour) => `${tour.id}:${tour.pointCount}`).join('|');
}

/** @param {unknown[][]} tracks */
const pointCountOf = (tracks) => tracks.reduce((sum, track) => sum + track.length, 0);

// Per-user memo of the budgeted map, so a warm map reads no track; past maxPoints in total the
// least recently used entries are evicted.
function createHeatmapCache({ maxPoints = DEFAULT_MAX_POINTS } = {}) {
  const entries = new Map();
  let cachedPoints = 0;

  function evict(userId) {
    cachedPoints -= entries.get(userId)?.points ?? 0;
    entries.delete(userId);
  }

  async function getOrCompute({ userId, tours, compute }) {
    const signature = signatureFor(tours);
    const cached = entries.get(userId);
    if (cached && cached.signature === signature) {
      // Re-inserted, so the Map's insertion order is the order of use.
      entries.delete(userId);
      entries.set(userId, cached);
      return cached.result;
    }

    const result = await compute();
    const points = pointCountOf(result);
    evict(userId);
    entries.set(userId, { signature, result, points });
    cachedPoints += points;
    while (cachedPoints > maxPoints) evict(entries.keys().next().value);
    return result;
  }

  return { getOrCompute };
}

module.exports = { createHeatmapCache, signatureFor };
