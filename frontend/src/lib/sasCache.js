// @ts-check

// Storage rejects these SAS URLs one to two hours after signing (sasExpiresOn, blobStorage.js).
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
