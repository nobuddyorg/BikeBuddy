import { describe, it, expect, vi } from 'vitest';
import { ensureMapData } from '../src/lib/mapData.js';
import { SAS_CACHE_TTL_MS, isStale } from '../src/lib/sasCache.js';

const ok = (body) => ({ ok: true, json: async () => body });

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

    await ensureMapData(apiFetch, tours);

    // The N+1 this replaced issued one GET /api/tours/{id} per tour (#355).
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/map');
    expect(tours[0].heatmapData).toEqual([[48, 11]]);
    expect(tours[0].images).toEqual([{ id: 'i1', lat: 48, lon: 11 }]);
    expect(tours[1].heatmapData).toEqual([]);
  });

  it('makes no request when every tour already has fresh data', async () => {
    const tours = [{ id: 't1', heatmapData: [], images: [], fetchedAt: Date.now() }];
    const apiFetch = vi.fn();

    await ensureMapData(apiFetch, tours);

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('leaves already-loaded tours untouched and only fills the new ones', async () => {
    const loaded = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'cached' }],
      fetchedAt: Date.now(),
    };
    const tours = [loaded, { id: 't2' }];
    const apiFetch = vi.fn(async () =>
      ok([
        { id: 't1', heatmapData: [[9, 9]], images: [] },
        { id: 't2', heatmapData: [[3, 4]], images: [] },
      ]),
    );

    await ensureMapData(apiFetch, tours);

    expect(loaded.heatmapData).toEqual([[1, 2]]);
    expect(loaded.images).toEqual([{ id: 'i1', url: 'cached' }]);
    expect(tours[1].heatmapData).toEqual([[3, 4]]);
  });

  it('settles tours missing from the response on empty data', async () => {
    const tours = [{ id: 'gone' }];

    await ensureMapData(async () => ok([]), tours);

    expect(tours[0]).toMatchObject({ id: 'gone', heatmapData: [], images: [] });
  });

  it('settles on empty data when the request fails', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => ({ ok: false }), tours);

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });

  it('settles on empty data when the network throws', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => {
      throw new Error('offline');
    }, tours);

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });

  // The photo URLs in the response are signed and expire, so a tour whose data
  // has aged past the cache TTL must be refilled rather than kept (#362).
  it('refills a tour whose signed photo URLs have gone stale', async () => {
    const stale = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'expired' }],
      detailLoaded: true,
      fetchedAt: Date.now() - SAS_CACHE_TTL_MS,
    };
    const apiFetch = vi.fn(async () =>
      ok([{ id: 't1', heatmapData: [[5, 6]], images: [{ id: 'i1', url: 'fresh' }] }]),
    );

    await ensureMapData(apiFetch, [stale]);

    expect(stale.images).toEqual([{ id: 'i1', url: 'fresh' }]);
    expect(stale.heatmapData).toEqual([[5, 6]]);
    // Only pinnable photos come back here, so the full gallery has to be refetched.
    expect(stale.detailLoaded).toBe(false);
    expect(isStale(stale)).toBe(false);
  });

  it('tolerates a response body that is not a list', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => ok(null), tours);

    expect(tours[0]).toMatchObject({ id: 't1', heatmapData: [], images: [] });
  });
});
