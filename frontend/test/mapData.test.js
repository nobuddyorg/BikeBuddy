import { describe, it, expect, vi } from 'vitest';
import { ensureMapData, queueMapDataLoads } from '../src/lib/mapData.js';
import { SAS_CACHE_TTL_MS, isStale } from '../src/lib/sasCache.js';

const ok = (body) => ({ ok: true, json: async () => body });
const NOW = Date.parse('2026-08-20T12:00:00Z');

describe('ensureMapData', () => {
  it('fills every tour from a single request', async () => {
    const tours = [{ id: 't1' }, { id: 't2' }];
    const apiFetch = vi.fn(async () =>
      ok([
        {
          id: 't1',
          heatmapData: [
            [48, 11],
            [52, 13],
          ],
          segmentStarts: [1],
          images: [{ id: 'i1', lat: 48, lon: 11 }],
        },
        { id: 't2', heatmapData: [], images: [] },
      ]),
    );

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/v1/map');
    expect(tours[0].heatmapData).toEqual([
      [48, 11],
      [52, 13],
    ]);
    expect(tours[0].segmentStarts).toEqual([1]);
    expect(tours[0].images).toEqual([{ id: 'i1', lat: 48, lon: 11 }]);
    expect(tours[1].heatmapData).toEqual([]);
    expect(tours[1].segmentStarts).toEqual([]);
  });

  it('makes no request when every tour already has fresh data', async () => {
    const tours = [{ id: 't1', heatmapData: [], images: [], fetchedAt: NOW }];
    const apiFetch = vi.fn();

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('leaves already-loaded tours untouched and only fills the new ones', async () => {
    const loaded = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'cached' }],
      fetchedAt: NOW,
    };
    const tours = [loaded, { id: 't2' }];
    const apiFetch = vi.fn(async () =>
      ok([
        { id: 't1', heatmapData: [[9, 9]], images: [] },
        { id: 't2', heatmapData: [[3, 4]], images: [] },
      ]),
    );

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(loaded.heatmapData).toEqual([[1, 2]]);
    expect(loaded.images).toEqual([{ id: 'i1', url: 'cached' }]);
    expect(tours[1].heatmapData).toEqual([[3, 4]]);
  });

  it('refills a tour missing either its track or its photos', async () => {
    const tours = [
      { id: 'no-track', images: [], fetchedAt: NOW },
      { id: 'no-photos', heatmapData: [], fetchedAt: NOW },
    ];
    const apiFetch = vi.fn(async () =>
      ok([
        { id: 'no-track', heatmapData: [[1, 1]], images: [] },
        { id: 'no-photos', heatmapData: [], images: [{ id: 'i1' }] },
      ]),
    );

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(tours[0].heatmapData).toEqual([[1, 1]]);
    expect(tours[1].images).toEqual([{ id: 'i1' }]);
  });

  it('settles tours missing from the response on empty data', async () => {
    const tours = [{ id: 'gone' }];

    await ensureMapData({ apiFetch: async () => ok([]), tours, now: NOW });

    expect(tours[0]).toMatchObject({ id: 'gone', heatmapData: [], images: [] });
  });

  it('settles on empty data unmarked, then rejects, when the request fails', async () => {
    const tours = [{ id: 't1' }];

    await expect(
      ensureMapData({ apiFetch: async () => ({ ok: false, status: 503 }), tours, now: NOW }),
    ).rejects.toThrow('GET /api/v1/map answered 503');

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
    expect(isStale(tours[0], NOW)).toBe(true);
  });

  it('retries on the next call after a failure', async () => {
    const tours = [{ id: 't1' }];
    await expect(
      ensureMapData({ apiFetch: async () => ({ ok: false, status: 503 }), tours, now: NOW }),
    ).rejects.toThrow();
    const apiFetch = vi.fn(async () => ok([{ id: 't1', heatmapData: [[1, 1]], images: [] }]));

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(tours[0].heatmapData).toEqual([[1, 1]]);
    expect(isStale(tours[0], NOW)).toBe(false);
  });

  it('keeps what a stale tour already shows when the refresh fails', async () => {
    const stale = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'old' }],
      detailLoaded: true,
      fetchedAt: NOW - SAS_CACHE_TTL_MS,
    };

    await expect(
      ensureMapData({
        apiFetch: async () => ({ ok: false, status: 500 }),
        tours: [stale],
        now: NOW,
      }),
    ).rejects.toThrow();

    expect(stale).toMatchObject({
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'old' }],
      detailLoaded: true,
    });
  });

  it('settles on empty data, then rejects, when the network throws', async () => {
    const tours = [{ id: 't1' }];
    const apiFetch = async () => {
      throw new Error('offline');
    };

    await expect(ensureMapData({ apiFetch, tours, now: NOW })).rejects.toThrow('offline');

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
    expect(isStale(tours[0], NOW)).toBe(true);
  });

  // The photo URLs are signed and expire, so data past the cache TTL is refetched.
  it('refills a tour whose signed photo URLs have gone stale', async () => {
    const stale = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'expired' }],
      detailLoaded: true,
      fetchedAt: NOW - SAS_CACHE_TTL_MS,
    };
    const apiFetch = vi.fn(async () =>
      ok([{ id: 't1', heatmapData: [[5, 6]], images: [{ id: 'i1', url: 'fresh' }] }]),
    );

    await ensureMapData({ apiFetch, tours: [stale], now: NOW });

    expect(stale.images).toEqual([{ id: 'i1', url: 'fresh' }]);
    expect(stale.heatmapData).toEqual([[5, 6]]);
    expect(stale.detailLoaded).toBe(false);
    expect(isStale(stale, NOW)).toBe(false);
  });

  it('replaces the photos of a tour whose gallery was never loaded', async () => {
    const stale = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'old', url: 'old' }],
      fetchedAt: NOW - SAS_CACHE_TTL_MS,
    };
    const apiFetch = async () => ok([{ id: 't1', heatmapData: [], images: [{ id: 'new' }] }]);

    await ensureMapData({ apiFetch, tours: [stale], now: NOW });

    expect(stale.images).toEqual([{ id: 'new' }]);
  });

  it('fills the photos of a loaded tour that has none yet', async () => {
    const tours = [{ id: 't1', heatmapData: [], detailLoaded: true }];
    const apiFetch = async () => ok([{ id: 't1', heatmapData: [], images: [{ id: 'new' }] }]);

    await ensureMapData({ apiFetch, tours, now: NOW });

    expect(tours[0].images).toEqual([{ id: 'new' }]);
  });

  // An open gallery looks photos up by id, so a refresh must not drop the unpinned ones.
  it('re-signs the pinned photos of a loaded gallery and keeps the others', async () => {
    const stale = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [
        { id: 'unpinned', url: 'old-a' },
        { id: 'pinned', url: 'old-b', lat: 1, lon: 2 },
      ],
      detailLoaded: true,
      fetchedAt: NOW - SAS_CACHE_TTL_MS,
    };
    const apiFetch = async () =>
      ok([
        {
          id: 't1',
          heatmapData: [[1, 2]],
          images: [{ id: 'pinned', url: 'new-b', lat: 1, lon: 2 }],
        },
      ]);

    await ensureMapData({ apiFetch, tours: [stale], now: NOW });

    expect(stale.images).toEqual([
      { id: 'unpinned', url: 'old-a' },
      { id: 'pinned', url: 'new-b', lat: 1, lon: 2 },
    ]);
    expect(stale.detailLoaded).toBe(false);
  });

  it.each([null, {}])('tolerates a response body that is not a list: %j', async (body) => {
    const tours = [{ id: 't1' }];

    await ensureMapData({ apiFetch: async () => ok(body), tours, now: NOW });

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });

  // A caller can start /api/map alongside /api/tours, so a cold backend is paid for once.
  it('consumes a pre-started fetch instead of issuing its own', async () => {
    const tours = [{ id: 't1' }];
    const apiFetch = vi.fn();
    const pendingResponse = Promise.resolve(ok([{ id: 't1', heatmapData: [[1, 1]], images: [] }]));

    await ensureMapData({ apiFetch, tours, now: NOW, pendingResponse });

    expect(apiFetch).not.toHaveBeenCalled();
    expect(tours[0].heatmapData).toEqual([[1, 1]]);
  });
});

describe('queueMapDataLoads', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((settle) => {
      resolve = settle;
    });
    return { promise, resolve };
  };

  it('lets overlapping loads share one request', async () => {
    const ensure = queueMapDataLoads();
    const response = deferred();
    const apiFetch = vi.fn(() => response.promise);
    const tours = [{ id: 't1' }];

    const first = ensure({ apiFetch, tours, now: NOW });
    const second = ensure({ apiFetch, tours, now: NOW });
    response.resolve(ok([{ id: 't1', heatmapData: [[48, 11]], images: [] }]));
    await Promise.all([first, second]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(tours[0].heatmapData).toEqual([[48, 11]]);
  });

  it('fetches again for a tour the load before it did not cover', async () => {
    const ensure = queueMapDataLoads();
    const apiFetch = vi.fn(async () =>
      ok([
        { id: 't1', heatmapData: [[1, 1]], images: [] },
        { id: 't2', heatmapData: [[2, 2]], images: [] },
      ]),
    );
    const earlier = [{ id: 't1' }];
    const later = [...earlier, { id: 't2' }];

    await Promise.all([
      ensure({ apiFetch, tours: earlier, now: NOW }),
      ensure({ apiFetch, tours: later, now: NOW }),
    ]);

    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(later[1].heatmapData).toEqual([[2, 2]]);
  });

  it('rejects only the failed load, and the next one retries', async () => {
    const ensure = queueMapDataLoads();
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(ok([{ id: 't1', heatmapData: [[1, 1]], images: [] }]));
    const tours = [{ id: 't1' }];

    const failed = ensure({ apiFetch, tours, now: NOW });
    const retried = ensure({ apiFetch, tours, now: NOW });

    await expect(failed).rejects.toThrow('GET /api/v1/map answered 503');
    await expect(retried).resolves.toBeUndefined();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
