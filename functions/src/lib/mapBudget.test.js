'use strict';

const { budgetHeatmapData } = require('./mapBudget');
const { distanceMeters } = require('./simplify');

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
const unlimitedGap = { maxGapMeters: Infinity };

describe('budgetHeatmapData', () => {
  it('leaves data untouched when total points exactly equal the budget', () => {
    const points = sine(50);
    const [track] = budgetHeatmapData([{ heatmapData: points }], {
      totalPointBudget: 50,
      ...unlimitedGap,
    });
    expect(track).toEqual(points);
  });

  it('returns an empty track for a tour without heatmapData', () => {
    expect(
      budgetHeatmapData([{ id: 'no-data' }], { totalPointBudget: 10, ...unlimitedGap }),
    ).toEqual([[]]);
  });

  it('simplifies once total points exceed the budget, even when one tour has no heatmapData', () => {
    const points = sine(50);
    const [simplified, empty] = budgetHeatmapData([{ heatmapData: points }, { id: 'no-data' }], {
      totalPointBudget: 10,
      ...unlimitedGap,
    });
    expect(simplified.length).toBeLessThan(points.length);
    expect(empty).toEqual([]);
  });

  it('clamps a small tour up to 20 points rather than down to its tiny raw share', () => {
    const [small] = budgetHeatmapData([{ heatmapData: wiggle(60) }, { heatmapData: sine(2000) }], {
      totalPointBudget: 300,
      ...unlimitedGap,
    });
    expect(small.length).toBe(20);
  });

  it("splits the budget proportionally to each tour's own point count", () => {
    const [big] = budgetHeatmapData([{ heatmapData: sine(2000) }, { heatmapData: wiggle(100) }], {
      totalPointBudget: 525,
      ...unlimitedGap,
    });
    // About 500 of 525 for the big tour; an inverted share would clamp it to 20.
    expect(big.length).toBeGreaterThan(100);
  });

  it('keeps consecutive points within the gap limit while simplifying', () => {
    const straightLine = (offset) =>
      Array.from({ length: 300 }, (_, index) => [48.0 + offset, 11.0 + index * 0.0001]);
    const tracks = budgetHeatmapData(
      [{ heatmapData: straightLine(0) }, { heatmapData: straightLine(1) }],
      { totalPointBudget: 200, maxGapMeters: 50 },
    );

    expect(tracks[0].length + tracks[1].length).toBeLessThanOrEqual(200);
    for (const track of tracks) {
      for (let index = 1; index < track.length; index++) {
        expect(distanceMeters(track[index - 1], track[index])).toBeLessThanOrEqual(50);
      }
    }
  });
});
