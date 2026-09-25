import { isStale, markFetched, markStale } from '../lib/sasCache.js';
import { state } from './state.js';
import { apiFetch } from './api.js';

// Keyed on the explicit flag rather than on heatmapData/images being present:
// ensureMapData fills those in too, from the leaner /api/map payload. Expires
// ahead of the signed URLs it holds, so a long-open tab refetches.
export async function ensureDetail(tour) {
  if (tour.detailLoaded && !isStale(tour, Date.now())) return;
  try {
    const res = await apiFetch(`/api/tours/${tour.id}`);
    if (res.ok) {
      const detail = await res.json();
      tour.heatmapData = detail.heatmapData || [];
      tour.images = detail.images || [];
      tour.gpxFileUrl = detail.gpxFileUrl;
      tour.elevationGain = detail.elevationGain ?? null;
      tour.durationSeconds = detail.durationSeconds ?? null;
      tour.avgSpeed = detail.avgSpeed ?? null;
    }
  } catch {
    // offline — the fallbacks below keep callers working
  }
  tour.heatmapData = tour.heatmapData || [];
  tour.images = tour.images || [];
  tour.detailLoaded = true;
  markFetched(tour, Date.now());
}

// Forces a fresh signature rather than retrying the dead URL (see sasCache.js),
// since one expired SAS URL means they all are. Resolves to the selected tour,
// or to nothing when the selection moved on while refetching.
export async function refreshSelectedTourImages() {
  const tour = state.tours.find((candidate) => candidate.id === state.selectedTourId);
  if (!tour) return undefined;
  markStale(tour);
  await ensureDetail(tour);
  if (state.selectedTourId !== tour.id) return undefined;
  return tour;
}
