import { describe, it, expect, vi } from 'vitest';
import { ensureMapData } from '../src/lib/mapData.js';

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

  it('makes no request when every tour already has its data', async () => {
    const tours = [{ id: 't1', heatmapData: [], images: [] }];
    const apiFetch = vi.fn();

    await ensureMapData(apiFetch, tours);

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('leaves already-loaded tours untouched and only fills the new ones', async () => {
    const loaded = {
      id: 't1',
      heatmapData: [[1, 2]],
      images: [{ id: 'i1', url: 'cached' }],
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

    expect(tours[0]).toEqual({ id: 'gone', heatmapData: [], images: [] });
  });

  it('settles on empty data when the request fails', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => ({ ok: false }), tours);

    expect(tours[0]).toEqual({ id: 't1', heatmapData: [], images: [] });
  });

  it('settles on empty data when the network throws', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => {
      throw new Error('offline');
    }, tours);

    expect(tours[0]).toEqual({ id: 't1', heatmapData: [], images: [] });
  });

  it('tolerates a response body that is not a list', async () => {
    const tours = [{ id: 't1' }];

    await ensureMapData(async () => ok(null), tours);

    expect(tours[0]).toEqual({ id: 't1', heatmapData: [], images: [] });
  });
});
