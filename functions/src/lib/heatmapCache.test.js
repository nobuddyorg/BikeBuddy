'use strict';

const { createHeatmapCache, signatureFor } = require('./heatmapCache');

describe('signatureFor', () => {
  it('combines each tour id with its stored point count, never the points themselves', async () => {
    const tours = [
      { id: 'a', pointCount: 2, heatmapData: [1, 2, 3] },
      { id: 'b', pointCount: 1 },
    ];
    expect(signatureFor(tours)).toBe('a:2|b:1');
  });
});

describe('createHeatmapCache', () => {
  const toursWith = (id, pointCount) => [
    { id, pointCount, heatmapData: Array(pointCount).fill(1) },
  ];

  it('computes once and reuses the result for an unchanged tour set', async () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 2);

    const first = await cache.getOrCompute({ userId: 'u1', tours, compute });
    const second = await cache.getOrCompute({ userId: 'u1', tours, compute });

    expect(first).toBe(second);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes when a tour is added or removed', async () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    await cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });
    await cache.getOrCompute({
      userId: 'u1',
      tours: [...toursWith('a', 2), ...toursWith('b', 1)],
      compute,
    });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('recomputes when a tour point count changes', async () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);

    await cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 2), compute });
    await cache.getOrCompute({ userId: 'u1', tours: toursWith('a', 3), compute });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps separate entries per user', async () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(() => ['computed']);
    const tours = toursWith('a', 2);

    await cache.getOrCompute({ userId: 'u1', tours, compute });
    await cache.getOrCompute({ userId: 'u2', tours, compute });

    expect(compute).toHaveBeenCalledTimes(2);
  });

  // Each result below holds as many points as its tour, so the cache's load is easy to follow.
  const tracksOf = (tours) => tours.map((tour) => tour.heatmapData);

  it('evicts the oldest entries once the cached points exceed maxPoints', async () => {
    const cache = createHeatmapCache({ maxPoints: 5 });
    const compute = vi.fn(tracksOf);
    const at = async (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      await cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    await at('u1', 2);
    await at('u2', 2);
    await at('u3', 2);
    await at('u2', 2);
    await at('u3', 2);
    await at('u1', 2);

    // u3 pushed the total to 6, so u1 went; u2 and u3 (4 points) stayed.
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('keeps entries while the cached points equal maxPoints', async () => {
    const cache = createHeatmapCache({ maxPoints: 4 });
    const compute = vi.fn(tracksOf);
    const at = async (userId) => {
      const tours = toursWith('a', 2);
      await cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    await at('u1');
    await at('u2');
    await at('u1');
    await at('u2');

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('counts a recomputed entry once, at its new size', async () => {
    const cache = createHeatmapCache({ maxPoints: 6 });
    const compute = vi.fn(tracksOf);
    const at = async (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      await cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    await at('u1', 2);
    await at('u2', 2);
    await at('u1', 3);
    await at('u3', 1);
    await at('u1', 3);
    await at('u3', 1);

    // 3 + 2 + 1 = 6 fits; had u1's old 2 points stayed counted, u2 would have gone.
    expect(compute).toHaveBeenCalledTimes(4);
    await at('u2', 2);
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('treats a recomputed entry as the newest when evicting', async () => {
    const cache = createHeatmapCache({ maxPoints: 4 });
    const compute = vi.fn(tracksOf);
    const at = async (userId, tourId) => {
      const tours = toursWith(tourId, 2);
      await cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    await at('u1', 'a');
    await at('u2', 'a');
    await at('u1', 'b');
    await at('u3', 'a');
    await at('u1', 'b');

    // u2 was the oldest entry, so u1's refreshed result survives u3's arrival.
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it('never keeps a result larger than maxPoints', async () => {
    const cache = createHeatmapCache({ maxPoints: 2 });
    const compute = vi.fn(tracksOf);
    const tours = toursWith('a', 3);

    const first = await cache.getOrCompute({ userId: 'u1', tours, compute: () => compute(tours) });
    await cache.getOrCompute({ userId: 'u1', tours, compute: () => compute(tours) });

    expect(first).toEqual([tours[0].heatmapData]);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('holds a million points by default', async () => {
    const cache = createHeatmapCache();
    const compute = vi.fn(tracksOf);
    const at = async (userId, pointCount) => {
      const tours = toursWith('a', pointCount);
      await cache.getOrCompute({ userId, tours, compute: () => compute(tours) });
    };

    await at('u1', 500000);
    await at('u2', 500000);
    await at('u1', 500000);
    await at('u3', 1);
    await at('u1', 500000);

    expect(compute).toHaveBeenCalledTimes(4);
  });
});
