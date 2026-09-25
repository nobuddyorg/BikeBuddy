// @ts-check

// Image and GPX URLs are SAS links storage stops honouring after an hour
// (SAS_TTL_MS in functions/src/lib/blobStorage.js), and a map tab stays open far
// longer. Expiring them early turns broken thumbnails and Azure error documents
// downloaded as .gpx back into refetches; the margin covers the gap
// between the check and the click after it.
export const SAS_CACHE_TTL_MS = 45 * 60 * 1000;

export function markFetched(tour, now) {
  tour.fetchedAt = now;
}

export function markStale(tour) {
  tour.fetchedAt = 0;
}

export function isStale(tour, now) {
  return now - (tour.fetchedAt ?? 0) >= SAS_CACHE_TTL_MS;
}
