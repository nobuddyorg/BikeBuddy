'use strict';

// Fills in the track points and pinnable photos the map needs, for every tour
// still missing them, with one request instead of one detail fetch per tour
// (#355). Tours that already carry the data — cached from an earlier call or
// from a full detail fetch — are left untouched. A failed request settles them
// on empty data so the map still renders and no retry storm follows.
export async function ensureMapData(apiFetch, tours) {
  const missing = tours.filter((tour) => !tour.heatmapData || !tour.images);
  if (missing.length === 0) return;

  let byId = new Map();
  try {
    const res = await apiFetch('/api/map');
    if (res.ok) byId = new Map(((await res.json()) || []).map((entry) => [entry.id, entry]));
  } catch {
    // network unavailable — fall through to empty data
  }

  for (const tour of missing) {
    const entry = byId.get(tour.id);
    tour.heatmapData = entry?.heatmapData || [];
    tour.images = entry?.images || [];
  }
}
