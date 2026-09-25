import { describe, it, expect, vi } from 'vitest';
import { ensureDetail } from '../src/lib/tourDetail.js';
import { SAS_CACHE_TTL_MS } from '../src/lib/sasCache.js';

const NOW = Date.parse('2026-08-20T12:00:00Z');
const ok = (body) => ({ ok: true, json: async () => body });

describe('ensureDetail', () => {
  it('loads the detail and marks it fresh', async () => {
    const tour = { id: 't1' };
    const apiFetch = vi.fn(async () =>
      ok({
        heatmapData: [[48, 11]],
        images: [{ id: 'i1' }],
        gpxFileUrl: 'https://blob/t1.gpx',
        elevationGain: 0,
        durationSeconds: 3600,
        avgSpeed: 20,
      }),
    );

    await ensureDetail({ apiFetch, tour, now: NOW });

    expect(apiFetch).toHaveBeenCalledWith('/api/tours/t1');
    expect(tour).toEqual({
      id: 't1',
      heatmapData: [[48, 11]],
      images: [{ id: 'i1' }],
      gpxFileUrl: 'https://blob/t1.gpx',
      elevationGain: 0,
      durationSeconds: 3600,
      avgSpeed: 20,
      detailLoaded: true,
      fetchedAt: NOW,
    });
  });

  it('keeps missing metrics unknown rather than zero', async () => {
    const tour = { id: 't1' };

    await ensureDetail({ apiFetch: async () => ok({}), tour, now: NOW });

    expect(tour).toMatchObject({
      heatmapData: [],
      images: [],
      elevationGain: null,
      durationSeconds: null,
      avgSpeed: null,
    });
  });

  it('makes no request while the loaded detail is fresh', async () => {
    const tour = { id: 't1', detailLoaded: true, fetchedAt: NOW - 1000 };
    const apiFetch = vi.fn();

    await ensureDetail({ apiFetch, tour, now: NOW });

    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('refetches a detail whose signed URLs have gone stale', async () => {
    const tour = { id: 't1', detailLoaded: true, fetchedAt: NOW - SAS_CACHE_TTL_MS, images: [] };

    await ensureDetail({ apiFetch: async () => ok({ images: [{ id: 'fresh' }] }), tour, now: NOW });

    expect(tour.images).toEqual([{ id: 'fresh' }]);
    expect(tour.fetchedAt).toBe(NOW);
  });

  it('rejects on an error status, leaving the detail missing but renderable', async () => {
    const tour = { id: 't1' };

    await expect(
      ensureDetail({ apiFetch: async () => ({ ok: false, status: 500 }), tour, now: NOW }),
    ).rejects.toThrow('GET /api/tours/t1 answered 500');

    expect(tour).toEqual({ id: 't1', heatmapData: [], images: [] });
  });

  it('rejects when the network fails, keeping data it already had', async () => {
    const tour = { id: 't1', heatmapData: [[1, 2]], images: [{ id: 'i1' }] };
    const apiFetch = async () => {
      throw new Error('offline');
    };

    await expect(ensureDetail({ apiFetch, tour, now: NOW })).rejects.toThrow('offline');

    expect(tour).toEqual({ id: 't1', heatmapData: [[1, 2]], images: [{ id: 'i1' }] });
  });
});
