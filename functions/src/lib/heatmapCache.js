// @ts-check
'use strict';

const DEFAULT_MAX_ENTRIES = 500;

// Id plus point count stands in for "unchanged": heatmapData is written once at
// upload and never edited.
function signatureFor(tours) {
  return tours.map((tour) => `${tour.id}:${tour.heatmapData?.length || 0}`).join('|');
}

// Per-user memo of the budgeted map response; beyond maxEntries the entry set
// longest ago is evicted.
function createHeatmapCache(maxEntries = DEFAULT_MAX_ENTRIES) {
  const entries = new Map();

  function getOrCompute({ userId, tours, compute }) {
    const signature = signatureFor(tours);
    const cached = entries.get(userId);
    if (cached && cached.signature === signature) return cached.result;

    const result = compute();
    entries.delete(userId);
    entries.set(userId, { signature, result });
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return result;
  }

  return { getOrCompute };
}

module.exports = { createHeatmapCache, signatureFor };
