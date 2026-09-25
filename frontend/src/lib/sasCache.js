// @ts-check

// Storage rejects these SAS URLs after an hour (SAS_TTL_MS, blobStorage.js); refetch well before.
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
