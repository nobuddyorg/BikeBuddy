'use strict';

import { isStale, markFetched } from './sasCache.js';

// One request for every tour still missing map data, rather than a detail fetch
// each (#355). Tours already holding fresh data are left alone until their
// signed photo URLs go stale (#362). A failure settles them on empty data, so
// the map still renders and no retry storm follows.
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
