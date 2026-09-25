// @ts-check

import { isStale, markFetched } from './sasCache.js';

async function fetchDetail({ apiFetch, tourId }) {
  const response = await apiFetch(`/api/tours/${tourId}`);
  if (!response.ok) throw new Error(`GET /api/tours/${tourId} answered ${response.status}`);
  return response.json();
}

function applyDetail({ tour, detail, now }) {
  tour.heatmapData = detail.heatmapData || [];
  tour.images = detail.images || [];
  tour.gpxFileUrl = detail.gpxFileUrl;
  // null, not 0: a GPX without elevation or timestamps has no such metric.
  tour.elevationGain = detail.elevationGain ?? null;
  tour.durationSeconds = detail.durationSeconds ?? null;
  tour.avgSpeed = detail.avgSpeed ?? null;
  tour.detailLoaded = true;
  markFetched(tour, now);
}

// Keyed on detailLoaded rather than on heatmapData/images being present:
// ensureMapData fills those in too, from the leaner /api/map payload. Expires
// ahead of the signed URLs it holds, so a long-open tab refetches. A failed
// fetch rejects, leaves the detail marked missing for the next call to retry,
// and still gives the tour empty track and photo lists to render.
export async function ensureDetail({ apiFetch, tour, now }) {
  if (tour.detailLoaded && !isStale(tour, now)) return;
  try {
    applyDetail({ tour, detail: await fetchDetail({ apiFetch, tourId: tour.id }), now });
  } finally {
    tour.heatmapData = tour.heatmapData || [];
    tour.images = tour.images || [];
  }
}
