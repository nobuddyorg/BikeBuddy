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

  // Each result below holds as many points as its tour, so the cache's load is easy to follow.
  const tracksOf = (tours) => tours.map((tour) => tour.heatmapData);

  it('evicts the oldest entries once the cached points exceed maxPoints', () => {
    const cache = createHeatmapCache({ maxPoints: 5 });
    const compute = vi.fn(tracksOf);
    const at = (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    at('u1', 2);
    at('u2', 2);
    at('u3', 2);
    at('u2', 2);
    at('u3', 2);
    at('u1', 2);

    // u3 pushed the total to 6, so u1 went; u2 and u3 (4 points) stayed.
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('keeps entries while the cached points equal maxPoints', () => {
    const cache = createHeatmapCache({ maxPoints: 4 });
    const compute = vi.fn(tracksOf);
    const at = (userId) => {
      const tours = toursWith('a', 2);
      cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    at('u1');
    at('u2');
    at('u1');
    at('u2');

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('counts a recomputed entry once, at its new size', () => {
    const cache = createHeatmapCache({ maxPoints: 6 });
    const compute = vi.fn(tracksOf);
    const at = (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    at('u1', 2);
    at('u2', 2);
    at('u1', 3);
    at('u3', 1);
    at('u1', 3);
    at('u3', 1);

    // 3 + 2 + 1 = 6 fits; had u1's old 2 points stayed counted, u2 would have gone.
    expect(compute).toHaveBeenCalledTimes(4);
    at('u2', 2);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('treats a recomputed entry as the newest when evicting', () => {
    const cache = createHeatmapCache({ maxPoints: 4 });
    const compute = vi.fn(tracksOf);
    const at = (userId, tourId) => {
      const tours = toursWith(tourId, 2);
      cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    at('u1', 'a');
    at('u2', 'a');
    at('u1', 'b');
    at('u3', 'a');
    at('u1', 'b');

    // u2 was the oldest entry, so u1's refreshed result survives u3's arrival.
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('never keeps a result larger than maxPoints', () => {
    const cache = createHeatmapCache({ maxPoints: 2 });
    const compute = vi.fn(tracksOf);
    const tours = toursWith('a', 3);

    const first = cache.getOrCompute({ userId: 'u1', tours, compute: () => compute(tours) });
    cache.getOrCompute({ userId: 'u1', tours, compute: () => compute(tours) });

    expect(first).toEqual([tours[0].heatmapData]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('holds a million points by default', () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(tracksOf);
    const at = (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    at('u1', 500000);
    at('u2', 500000);
    at('u1', 500000);
    at('u3', 1);
    at('u1', 500000);

    expect(compute).toHaveBeenCalledTimes(4);
  });
});
