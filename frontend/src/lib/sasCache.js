'use strict';

// Image and GPX URLs arrive as SAS links that storage stops honouring after an
// hour (SAS_TTL_MS in functions/src/lib/blobStorage.js). A map tab is left open
// far longer than that, so anything holding those URLs is treated as stale well
// before they expire and refetched instead — otherwise thumbnails turn into
// broken images and a GPX download quietly delivers an Azure error document
// under a .gpx filename (#362). The margin covers the time between the check
// and the click that follows it.
export const SAS_CACHE_TTL_MS = 45 * 60 * 1000;

export function markFetched(tour) {
  tour.fetchedAt = Date.now();
}

export function isStale(tour) {
  return Date.now() - (tour.fetchedAt ?? 0) >= SAS_CACHE_TTL_MS;
}
