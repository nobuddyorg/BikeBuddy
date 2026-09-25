// @ts-check

import { isStale, markFetched } from './sasCache.js';

async function fetchMapEntries({ apiFetch, pendingResponse }) {
  const response = await (pendingResponse ?? apiFetch('/api/map'));
  if (!response.ok) throw new Error(`GET /api/map answered ${response.status}`);
  return (await response.json()) || [];
}

// One request for every tour still missing map data, rather than a detail fetch
// each. Tours already holding fresh data are left alone until their signed
// photo URLs go stale. A failure still settles them on empty data, so the map
// renders and no retry storm follows, and then rejects so the caller can say
// so. pendingResponse lets a caller hand in a fetch already started in
// parallel with the tour list itself, instead of paying its cold-start latency
// a second time.
export async function ensureMapData({ apiFetch, tours, now, pendingResponse }) {
  const missing = tours.filter((tour) => !tour.heatmapData || !tour.images || isStale(tour, now));
  if (missing.length === 0) return;

  let entriesById = new Map();
  try {
    const entries = await fetchMapEntries({ apiFetch, pendingResponse });
    entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  } finally {
    for (const tour of missing) {
      const entry = entriesById.get(tour.id);
      tour.heatmapData = entry?.heatmapData || [];
      // Only the pinnable photos come back here, so a tour that had the full
      // gallery loaded no longer does — the next detail fetch has to run again.
      tour.images = entry?.images || [];
      tour.detailLoaded = false;
      markFetched(tour, now);
    }
  }
}
