// @ts-check

import { isStale, markFetched } from './sasCache.js';

async function fetchMapEntries({ apiFetch, pendingResponse }) {
  const response = await (pendingResponse ?? apiFetch('/api/map'));
  if (!response.ok) throw new Error(`GET /api/map answered ${response.status}`);
  return (await response.json()) || [];
}

// A failure settles the tours on empty data, so no retry storm follows, then rejects.
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
      // /api/map carries only the pinnable photos, so the full gallery must be fetched again.
      tour.images = entry?.images || [];
      tour.detailLoaded = false;
      markFetched(tour, now);
    }
  }
}
