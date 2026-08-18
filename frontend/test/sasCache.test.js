import { describe, it, expect } from 'vitest';
import { SAS_CACHE_TTL_MS, isStale, markFetched } from '../src/lib/sasCache.js';

// SAS_TTL_MS in functions/src/lib/blobStorage.js. The client cache has to give
// up on a signed URL before storage does, or it hands out URLs that 403.
const SERVER_SAS_TTL_MS = 60 * 60 * 1000;

describe('sasCache', () => {
  it('expires before the signed URLs it caches do', () => {
    expect(SAS_CACHE_TTL_MS).toBeLessThan(SERVER_SAS_TTL_MS);
  });

  it('treats a tour that was never fetched as stale', () => {
    expect(isStale({ id: 't1' })).toBe(true);
  });

  it('treats a just-fetched tour as fresh', () => {
    const tour = { id: 't1' };
    markFetched(tour);

    expect(isStale(tour)).toBe(false);
  });

  it('treats a tour as stale once the TTL has elapsed', () => {
    expect(isStale({ id: 't1', fetchedAt: Date.now() - SAS_CACHE_TTL_MS })).toBe(true);
  });

  it('treats a tour just short of the TTL as fresh', () => {
    expect(isStale({ id: 't1', fetchedAt: Date.now() - SAS_CACHE_TTL_MS + 5000 })).toBe(false);
  });
});
