// @ts-check

import { markFetched, isStale } from './sasCache.js';

async function fetchMapEntriesById({ apiFetch, pendingResponse }) {
  const response = await (pendingResponse ?? apiFetch('/api/v1/map'));
  if (!response.ok) throw new Error(`GET /api/v1/map answered ${response.status}`);
  const entries = await response.json();
  if (!Array.isArray(entries)) return new Map();
  return new Map(entries.map((entry) => [entry.id, entry]));
}

// /api/v1/map carries only the pinnable photos: a loaded gallery keeps its other photos.
function refreshedImages(tour, freshImages) {
  if (!tour.detailLoaded || !tour.images) return freshImages;
  const freshById = new Map(freshImages.map((image) => [image.id, image]));
  return tour.images.map((image) => freshById.get(image.id) ?? image);
}

function applyEntry({ tour, entry, now }) {
  tour.heatmapData = entry?.heatmapData || [];
  tour.segmentStarts = entry?.segmentStarts || [];
  tour.images = refreshedImages(tour, entry?.images || []);
  // The gallery's other photos were not re-signed, so the next opening fetches the detail again.
  tour.detailLoaded = false;
  markFetched(tour, now);
}

// A failure leaves the tours unmarked, so the next render retries, and rejects.
export async function ensureMapData({ apiFetch, tours, now, pendingResponse }) {
  const missing = tours.filter((tour) => !tour.heatmapData || !tour.images || isStale(tour, now));
  if (missing.length === 0) return;

  try {
    const entriesById = await fetchMapEntriesById({ apiFetch, pendingResponse });
    for (const tour of missing) applyEntry({ tour, entry: entriesById.get(tour.id), now });
  } catch (error) {
    for (const tour of missing) {
      tour.heatmapData = tour.heatmapData || [];
      tour.images = tour.images || [];
    }
    throw error;
  }
}

/**
 * Overlapping renders share one /api/v1/map: each call waits for the one before it, then fetches only
 * what that one left missing (a tour added meanwhile, or everything after a failure).
 */
export function queueMapDataLoads() {
  let previous = Promise.resolve();
  return (options) => {
    const current = previous.then(() => ensureMapData(options));
    previous = current.catch(() => {});
    return current;
  };
}
