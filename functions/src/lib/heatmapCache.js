'use strict';

const DEFAULT_MAX_ENTRIES = 500;

// A tour's heatmapData is set once at upload and never edited (EditTour only
// touches name/description/createdAt), so id+length is a cheap, safe stand-in
// for "this tour's points haven't changed" without hashing the points
// themselves.
function signatureFor(tours) {
  return tours.map((tour) => `${tour.id}:${tour.heatmapData?.length || 0}`).join('|');
}

// Per-user memo of the last budgeted/simplified heatmap response. Recomputing
// Douglas-Peucker simplification is the expensive part of a /map request; a
// user's tour set changes far less often than they load the map, so caching
// it here turns a repeat load into a signature comparison instead of a
// re-simplify. Bounded to maxEntries with simple LRU-ish eviction so a
// long-lived warm instance serving many distinct users doesn't grow forever.
function createHeatmapCache(maxEntries = DEFAULT_MAX_ENTRIES) {
  const cache = new Map();

  function getOrCompute(userId, tours, compute) {
    const signature = signatureFor(tours);
    const cached = cache.get(userId);
    if (cached && cached.signature === signature) return cached.result;

    const result = compute();
    cache.delete(userId);
    cache.set(userId, { signature, result });
    if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    return result;
  }

  return { getOrCompute };
}

module.exports = { createHeatmapCache, signatureFor };
