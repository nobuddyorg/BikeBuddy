'use strict';

const { simplifyToTarget, perpendicularDistanceMeters } = require('./simplify');

describe('perpendicularDistanceMeters', () => {
  const segment = { start: [48.0, 11.0], end: [48.001, 11.002] };

  it('computes the distance for a point that projects inside the segment', () => {
    expect(perpendicularDistanceMeters([48.0005, 11.0005], segment)).toBeCloseTo(22.3, 1);
  });

  it('measures to the segment end for a point beyond it', () => {
    expect(perpendicularDistanceMeters([48.002, 11.003], segment)).toBeCloseTo(133.9, 1);
  });

  it('measures to the segment start for a point before it', () => {
    expect(perpendicularDistanceMeters([47.999, 10.999], segment)).toBeCloseTo(133.9, 1);
  });

  it('measures a pure latitude difference with the latitude scale for a zero-length segment', () => {
    const point = { start: [0, 0], end: [0, 0] };
    expect(perpendicularDistanceMeters([1, 0], point)).toBeCloseTo(111320, 0);
  });
});

describe('simplifyToTarget', () => {
  const straightLine = Array.from({ length: 200 }, (_, index) => [48.0, 11.0 + index * 0.0001]);

  it('returns the input unchanged when already at or below target', () => {
    const points = [
      [48.1, 11.5],
      [48.2, 11.6],
    ];
    expect(simplifyToTarget(points, { targetCount: 10 })).toBe(points);
  });

  it('returns exactly the requested point count', () => {
    expect(simplifyToTarget(straightLine, { targetCount: 20 })).toHaveLength(20);
  });

  it('always keeps the endpoints', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 3 });
    expect(result[0]).toBe(straightLine[0]);
    expect(result.at(-1)).toBe(straightLine.at(-1));
  });

  it('returns the input unchanged for a target below two points', () => {
    expect(simplifyToTarget(straightLine, { targetCount: 1 })).toBe(straightLine);
  });

  it('simplifies a track down to its two endpoints for a target of two', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 2 });
    expect(result).toEqual([straightLine[0], straightLine.at(-1)]);
  });

  it('picks the point with the largest perpendicular distance, not the last one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.003];
    const bigDeviation = [0.002, 0.001];
    const smallDeviation = [0.0005, 0.002];
    const result = simplifyToTarget([first, bigDeviation, smallDeviation, last], {
      targetCount: 3,
    });
    expect(result).toEqual([first, bigDeviation, last]);
  });

  it('breaks a tie between two equally-distant points in favor of the first one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const tiedFirst = [0.001, 0.0005];
    const tiedSecond = [0.001, 0.0015];
    const result = simplifyToTarget([first, tiedFirst, tiedSecond, last], { targetCount: 3 });
    expect(result).toEqual([first, tiedFirst, last]);
  });

  it('keeps a real turn over points that sit on a straight line', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.0, 11.002],
      [48.01, 11.002],
      [48.01, 11.003],
    ];
    expect(simplifyToTarget(points, { targetCount: 3 })).toEqual([points[0], points[2], points[4]]);
  });

  it('keeps the outlying point of a loop back to its own start', () => {
    const points = [
      [48.0, 11.0],
      [48.0001, 11.0001],
      [48.001, 11.0005],
      [48.0, 11.0],
    ];
    expect(simplifyToTarget(points, { targetCount: 3 })).toContainEqual(points[2]);
  });

  // A point exposed by a split never outranks the split, so a kept point keeps its ancestors.
  it('keeps the split over a point it exposed, even one farther from the smaller chord', () => {
    const first = [0, 0];
    const last = [0, 0.01];
    // 11.1 m off the whole chord: the first split.
    const split = [0.0001, 0.005];
    // 10.0 m off the whole chord, but 12.2 m off the chord from split to last.
    const exposed = [-0.00009, 0.009];
    const result = simplifyToTarget([first, split, exposed, last], { targetCount: 3 });
    expect(result).toEqual([first, split, last]);
  });

  it('keeps the recorded order of the points it keeps', () => {
    const zigzag = Array.from({ length: 50 }, (_, index) => [
      48.0 + (index % 2) * 0.001 * (index % 7),
      11.0 + index * 0.0001,
    ]);
    const result = simplifyToTarget(zigzag, { targetCount: 10 });
    const positions = result.map((point) => zigzag.indexOf(point));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });
});
