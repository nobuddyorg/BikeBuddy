'use strict';

// Timing only means something uninstrumented, so the mutation run leaves this file out.
const { budgetTracks, TOTAL_POINT_BUDGET } = require('./mapBudget');

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

describe('budgetTracks (performance)', () => {
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
