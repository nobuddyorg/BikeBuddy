// @ts-check

import { isStale, markFetched } from './sasCache.js';

async function fetchDetail({ apiFetch, tourId }) {
  const response = await apiFetch(`/api/tours/${tourId}`);
  if (!response.ok) throw new Error(`GET /api/tours/${tourId} answered ${response.status}`);
  return response.json();
}

function applyDetail({ tour, detail, now }) {
  tour.heatmapData = detail.heatmapData || [];
  tour.segmentStarts = detail.segmentStarts || [];
  tour.images = detail.images || [];
  tour.gpxFileUrl = detail.gpxFileUrl;
  // null, not 0: a GPX without elevation or timestamps has no such metric.
  tour.elevationGain = detail.elevationGain ?? null;
  tour.durationSeconds = detail.durationSeconds ?? null;
  tour.avgSpeed = detail.avgSpeed ?? null;
  tour.detailLoaded = true;
  markFetched(tour, now);
}

// detailLoaded marks a full load: ensureMapData also fills heatmapData/images, from /api/map.
export async function ensureDetail({ apiFetch, tour, now }) {
  if (tour.detailLoaded && !isStale(tour, now)) return;
  try {
    applyDetail({ tour, detail: await fetchDetail({ apiFetch, tourId: tour.id }), now });
  } finally {
    tour.heatmapData = tour.heatmapData || [];
    tour.images = tour.images || [];
  }
}
