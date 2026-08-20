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
  it('computes once and reuses the result for an unchanged tour set', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = [{ id: 'a', heatmapData: [1, 2] }];

    const first = cache.getOrCompute('u1', tours, compute);
    const second = cache.getOrCompute('u1', tours, compute);

    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a tour is added or removed', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    cache.getOrCompute('u1', [{ id: 'a', heatmapData: [1, 2] }], compute);
    cache.getOrCompute(
      'u1',
      [
        { id: 'a', heatmapData: [1, 2] },
        { id: 'b', heatmapData: [1] },
      ],
      compute,
    );

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes when a tour point count changes', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    cache.getOrCompute('u1', [{ id: 'a', heatmapData: [1, 2] }], compute);
    cache.getOrCompute('u1', [{ id: 'a', heatmapData: [1, 2, 3] }], compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps separate entries per user', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = [{ id: 'a', heatmapData: [1, 2] }];

    cache.getOrCompute('u1', tours, compute);
    cache.getOrCompute('u2', tours, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once maxEntries is exceeded', () => {
    const cache = createHeatmapCache(2);
    const compute = vi.fn(() => ['computed']);
    const toursFor = (id) => [{ id, heatmapData: [1] }];

    cache.getOrCompute('u1', toursFor('a'), compute);
    cache.getOrCompute('u2', toursFor('a'), compute);
    cache.getOrCompute('u3', toursFor('a'), compute);
    cache.getOrCompute('u1', toursFor('a'), compute);

    // u1 was evicted to make room for u3, so its second call recomputes.
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
