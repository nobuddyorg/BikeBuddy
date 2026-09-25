'use strict';

const { budgetTracks, TOTAL_POINT_BUDGET } = require('./mapBudget');

const sine = (count) =>
  Array.from({ length: count }, (_, index) => [
    48.0 + 0.01 * Math.sin(index * 0.05),
    11.0 + index * 0.0002,
  ]);
const wiggle = (count) =>
  Array.from({ length: count }, (_, index) => [
    48.5 + 0.01 * Math.sin(index * 0.3),
    11.0 + index * 0.0003,
  ]);
const pointsIn = (tracks) => tracks.reduce((sum, track) => sum + track.length, 0);

// A seeded random walk with 20 m steps: long rides whose points are too far apart to merge.
function randomWalk({ points, seed }) {
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  let [latitude, longitude, heading] = [47 + seed * 1e-6, 10, random() * 2 * Math.PI];
  return Array.from({ length: points }, () => {
    heading += (random() - 0.5) * 0.6;
    latitude += (Math.cos(heading) * 20) / 111_320;
    longitude += (Math.sin(heading) * 20) / 75_000;
    return [latitude, longitude];
  });
}

describe('budgetTracks', () => {
  it('leaves data untouched when total points exactly equal the budget', () => {
    const points = sine(50);
    const [track] = budgetTracks([{ heatmapData: points }], { totalPointBudget: 50 });
    expect(track).toBe(points);
  });

  it('returns an empty track for a tour without heatmapData', () => {
    expect(budgetTracks([{ id: 'no-data' }], { totalPointBudget: 10 })).toEqual([[]]);
  });

  it('simplifies once total points exceed the budget, even when one tour has no heatmapData', () => {
    const [simplified, empty] = budgetTracks([{ heatmapData: sine(50) }, { id: 'no-data' }], {
      totalPointBudget: 10,
    });
    expect(simplified).toHaveLength(10);
    expect(empty).toEqual([]);
  });

  it('gives a small tour its 20-point floor plus its share of the rest', () => {
    const [small, big] = budgetTracks([{ heatmapData: wiggle(60) }, { heatmapData: sine(2000) }], {
      totalPointBudget: 300,
    });
    // Floor 20 each, then 260 shared by point count: 20 + ⌊260·60/2060⌋ and 20 + ⌊260·2000/2060⌋.
    expect(small).toHaveLength(27);
    expect(big).toHaveLength(272);
  });

  it('lowers the floor when the tours cannot all keep 20 points', () => {
    const tours = Array.from({ length: 10 }, () => ({ heatmapData: sine(100) }));
    const tracks = budgetTracks(tours, { totalPointBudget: 50 });
    expect(tracks.map((track) => track.length)).toEqual(Array(10).fill(5));
  });

  it('never drops below two points per track, the start and the end', () => {
    const tours = Array.from({ length: 10 }, () => ({ heatmapData: sine(100) }));
    const tracks = budgetTracks(tours, { totalPointBudget: 10 });
    expect(tracks.map((track) => track.length)).toEqual(Array(10).fill(2));
  });

  // The #546 regression: 20 m apart, no point merges under a gap rule, so 1,000,000 stayed 1,000,000.
  it('holds 200 rides of 100 km to the budget in bounded time', () => {
    const tours = Array.from({ length: 200 }, (_, seed) => ({
      heatmapData: randomWalk({ points: 5000, seed: seed + 1 }),
    }));

    const started = performance.now();
    const tracks = budgetTracks(tours, { totalPointBudget: TOTAL_POINT_BUDGET });
    const elapsedMs = performance.now() - started;

    expect(pointsIn(tracks)).toBeLessThanOrEqual(TOTAL_POINT_BUDGET);
    expect(pointsIn(tracks)).toBeGreaterThan(TOTAL_POINT_BUDGET * 0.99);
    // Measured about 1 s locally, against 13-17 s before; generous for slower CI runners.
    expect(elapsedMs).toBeLessThan(10_000);
  }, 60_000);
});
