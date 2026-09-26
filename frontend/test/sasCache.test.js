import { describe, it, expect } from 'vitest';
import { SAS_CACHE_TTL_MS, isStale, markFetched, markStale } from '../src/lib/sasCache.js';

const NOW = Date.parse('2026-08-20T12:00:00Z');

// SAS_TTL_MS in functions/src/lib/blobStorage.js; the client must give up on a URL first.
const SERVER_SAS_TTL_MS = 60 * 60 * 1000;

describe('sasCache', () => {
  it('expires before the signed URLs it caches do', () => {
    expect(SAS_CACHE_TTL_MS).toBeLessThan(SERVER_SAS_TTL_MS);
  });

  it('treats a tour that was never fetched as stale', () => {
    expect(isStale({ id: 't1' }, NOW)).toBe(true);
  });

  it('treats a just-fetched tour as fresh', () => {
    const tour = { id: 't1' };
    markFetched(tour, NOW);

    expect(isStale(tour, NOW)).toBe(false);
  });

  it('treats a tour as stale once the TTL has elapsed', () => {
    expect(isStale({ id: 't1', fetchedAt: NOW - SAS_CACHE_TTL_MS }, NOW)).toBe(true);
  });

  it('treats a tour just short of the TTL as fresh', () => {
    expect(isStale({ id: 't1', fetchedAt: NOW - SAS_CACHE_TTL_MS + 1 }, NOW)).toBe(false);
  });

  it('treats a tour marked stale as stale however recently it was fetched', () => {
    const tour = { id: 't1' };
    markFetched(tour, NOW);
    markStale(tour);

    expect(isStale(tour, NOW)).toBe(true);
  });
});
