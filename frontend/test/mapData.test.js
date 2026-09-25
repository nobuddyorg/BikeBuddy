import { describe, it, expect, vi } from 'vitest';
import { ensureMapData } from '../src/lib/mapData.js';
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
          heatmapData: [[48, 11]],
          images: [{ id: 'i1', lat: 48, lon: 11 }],
        },
        { id: 't2', heatmapData: [], images: [] },
      ]),
    );

    await ensureMapData({ apiFetch, tours, now: NOW });

    // The N+1 this replaced issued one GET /api/tours/{id} per tour.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/map');
    expect(tours[0].heatmapData).toEqual([[48, 11]]);
    expect(tours[0].images).toEqual([{ id: 'i1', lat: 48, lon: 11 }]);
    expect(tours[1].heatmapData).toEqual([]);
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

  it('settles tours missing from the response on empty data', async () => {
    const tours = [{ id: 'gone' }];

    await ensureMapData({ apiFetch: async () => ok([]), tours, now: NOW });

    expect(tours[0]).toMatchObject({ id: 'gone', heatmapData: [], images: [] });
  });

  it('settles on empty data, then rejects, when the request fails', async () => {
    const tours = [{ id: 't1' }];

    await expect(
      ensureMapData({ apiFetch: async () => ({ ok: false, status: 503 }), tours, now: NOW }),
    ).rejects.toThrow('GET /api/map answered 503');

    // Settled, so the next render does not fire the failing request again.
    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [], fetchedAt: NOW });
  });

  it('settles on empty data, then rejects, when the network throws', async () => {
    const tours = [{ id: 't1' }];
    const apiFetch = async () => {
      throw new Error('offline');
    };

    await expect(ensureMapData({ apiFetch, tours, now: NOW })).rejects.toThrow('offline');

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });

  // The photo URLs in the response are signed and expire, so a tour whose data
  // has aged past the cache TTL must be refilled rather than kept.
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
    // Only pinnable photos come back here, so the full gallery has to be refetched.
    expect(stale.detailLoaded).toBe(false);
    expect(isStale(stale, NOW)).toBe(false);
  });

  it('tolerates a response body that is not a list', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData({ apiFetch: async () => ok(null), tours, now: NOW });

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });

  // Lets a caller start /api/map alongside /api/tours instead of after it, so a
  // cold backend only pays its cold-start latency once per load.
  it('consumes a pre-started fetch instead of issuing its own', async () => {
    const tours = [{ id: 't1' }];
    const apiFetch = vi.fn();
    const pendingResponse = Promise.resolve(ok([{ id: 't1', heatmapData: [[1, 1]], images: [] }]));

    await ensureMapData({ apiFetch, tours, now: NOW, pendingResponse });

    expect(apiFetch).not.toHaveBeenCalled();
    expect(tours[0].heatmapData).toEqual([[1, 1]]);
  });
});
