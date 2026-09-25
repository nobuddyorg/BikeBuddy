'use strict';

const { createHeatmapCache, signatureFor } = require('./heatmapCache');

describe('signatureFor', () => {
  it('combines each tour id with its point count', () => {
    const tours = [
      { id: 'a', heatmapData: [1, 2] },
      { id: 'b', heatmapData: [1] },
    ];
    expect(signatureFor(tours)).toBe('a:2|b:1');
  });

  it('treats a missing heatmapData as zero points', () => {
    expect(signatureFor([{ id: 'a' }])).toBe('a:0');
  });
});

describe('createHeatmapCache', () => {
  const toursWith = (id, pointCount) => [{ id, heatmapData: Array(pointCount).fill(1) }];

  it('computes once and reuses the result for an unchanged tour set', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 2);

    const first = cache.getOrCompute({ userId: 'u1', tours, compute });
    const second = cache.getOrCompute({ userId: 'u1', tours, compute });

    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a tour is added or removed', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });
    cache.getOrCompute({
      userId: 'u1',
      tours: [...toursWith('a', 2), ...toursWith('b', 1)],
      compute,
    });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes when a tour point count changes', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });
    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 3), compute });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps separate entries per user', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 2);

    cache.getOrCompute({ userId: 'u1', tours, compute });
    cache.getOrCompute({ userId: 'u2', tours, compute });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once maxEntries is exceeded', () => {
    const cache = createHeatmapCache(2);
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 1);

    cache.getOrCompute({ userId: 'u1', tours, compute });
    cache.getOrCompute({ userId: 'u2', tours, compute });
    cache.getOrCompute({ userId: 'u3', tours, compute });
    cache.getOrCompute({ userId: 'u1', tours, compute });

    // u1 was evicted to make room for u3, so its second call recomputes.
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('keeps exactly maxEntries users cached', () => {
    const cache = createHeatmapCache(2);
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 1);

    cache.getOrCompute({ userId: 'u1', tours, compute });
    cache.getOrCompute({ userId: 'u2', tours, compute });
    cache.getOrCompute({ userId: 'u1', tours, compute });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('treats a recomputed entry as the newest when evicting', () => {
    const cache = createHeatmapCache(2);
    const compute = vi.fn(() => ['computed']);

    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 1), compute });
    cache.getOrCompute({ userId: 'u2', tours: toursWith('a', 1), compute });
    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });
    cache.getOrCompute({ userId: 'u3', tours: toursWith('a', 1), compute });
    cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });

    // u2 was the oldest entry, so u1's refreshed result survives u3's arrival.
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
