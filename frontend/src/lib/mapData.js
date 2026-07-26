'use strict';

import { isStale, markFetched } from './sasCache.js';

// Fills in the track points and pinnable photos the map needs, for every tour
// still missing them, with one request instead of one detail fetch per tour
// (#355). Tours that already carry fresh data — cached from an earlier call or
// from a full detail fetch — are left untouched; once their signed photo URLs
// go stale they are refilled (#362). A failed request settles them on empty
// data so the map still renders and no retry storm follows.
export async function ensureMapData(apiFetch, tours) {
  const missing = tours.filter((tour) => !tour.heatmapData || !tour.images || isStale(tour));
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
    // Only the pinnable photos come back here, so a tour that had the full
    // gallery loaded no longer does — the next detail fetch has to run again.
    tour.images = entry?.images || [];
    tour.detailLoaded = false;
    markFetched(tour);
  }
}
