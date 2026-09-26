'use strict';

const { budgetTracks } = require('./mapBudget');

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

describe('budgetTracks', () => {
  it('leaves data untouched when total points exactly equal the budget', () => {
    const points = sine(50);
    const [track] = budgetTracks([{ heatmapData: points }], { totalPointBudget: 50 });
    expect(track).toBe(points);
  });

  it('leaves every track untouched at exactly the budget, whatever their shares would be', () => {
    const [short, long] = [sine(10), sine(40)];
    const tracks = budgetTracks([{ heatmapData: short }, { heatmapData: long }], {
      totalPointBudget: 50,
    });
    expect(tracks[0]).toBe(short);
    expect(tracks[1]).toBe(long);
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

  it('holds many long rides to the budget, each with a share of it', () => {
    const tours = Array.from({ length: 40 }, (_, index) => ({ heatmapData: sine(1000 + index) }));

    const tracks = budgetTracks(tours, { totalPointBudget: 4000 });

    expect(pointsIn(tracks)).toBeLessThanOrEqual(4000);
    expect(pointsIn(tracks)).toBeGreaterThan(3950);
    expect(Math.min(...tracks.map((track) => track.length))).toBeGreaterThanOrEqual(20);
  });
});
