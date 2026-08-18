'use strict';

const {
  douglasPeucker,
  simplifyToTarget,
  distanceMeters,
  perpendicularDistanceMeters,
} = require('./simplify');

describe('distanceMeters', () => {
  it('computes a pure latitude delta (isolates the *mLat term)', () => {
    expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111320, 0);
  });
});

describe('perpendicularDistanceMeters', () => {
  const a = [48.0, 11.0];
  const b = [48.001, 11.002];

  it('computes the distance for a point that projects inside the segment', () => {
    expect(perpendicularDistanceMeters([48.0005, 11.0005], a, b)).toBeCloseTo(22.3, 1);
  });

  it('clamps the projection at b for a point beyond the segment end', () => {
    expect(perpendicularDistanceMeters([48.002, 11.003], a, b)).toBeCloseTo(133.9, 1);
  });

  it('clamps the projection at a for a point before the segment start', () => {
    expect(perpendicularDistanceMeters([47.999, 10.999], a, b)).toBeCloseTo(133.9, 1);
  });
});

describe('douglasPeucker', () => {
  it('leaves short tracks untouched', () => {
    const points = [
      [48.1, 11.5],
      [48.2, 11.6],
    ];
    expect(douglasPeucker(points, 10)).toEqual(points);
  });

  it('returns a single point unchanged rather than duplicating it (points.length < 3 guard)', () => {
    expect(douglasPeucker([[1, 2]], 5)).toEqual([[1, 2]]);
  });

  it('drops the middle of exactly 3 collinear points (points.length < 3 boundary, not <=)', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.0, 11.002],
    ];
    expect(douglasPeucker(points, 50)).toEqual([points[0], points[2]]);
  });

  it('picks the point with the largest perpendicular distance, not the last one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.003];
    const bigDeviation = [0.002, 0.001];
    const smallDeviation = [0.0005, 0.002];
    const result = douglasPeucker([first, bigDeviation, smallDeviation, last], 60, Infinity);
    expect(result).toEqual([first, bigDeviation, last]);
  });

  it('breaks a tie between two equally-distant points in favor of the first one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const tiedFirst = [0.001, 0.0005];
    const tiedSecond = [0.001, 0.0015];
    const result = douglasPeucker([first, tiedFirst, tiedSecond, last], 80, Infinity);
    expect(result).toEqual([first, tiedFirst, last]);
  });

  it('does not split when the max perpendicular distance exactly equals epsilon', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const mid = [0.001, 0.001];
    const epsilon = perpendicularDistanceMeters(mid, first, last);
    expect(douglasPeucker([first, mid, last], epsilon, Infinity)).toEqual([first, last]);
  });

  it('collapses to the endpoints when the gap exactly equals maxGapMeters', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const mid = [0.001, 0.001];
    const gap = distanceMeters(first, last);
    expect(douglasPeucker([first, mid, last], 100000, gap)).toEqual([first, last]);
  });

  it('collapses points that sit on a straight line', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.0, 11.002],
      [48.0, 11.003],
      [48.0, 11.004],
    ];
    const result = douglasPeucker(points, 5);
    expect(result).toEqual([points[0], points[points.length - 1]]);
  });

  it('keeps a point that marks a real turn', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.01, 11.001],
      [48.01, 11.002],
    ];
    const result = douglasPeucker(points, 5);
    expect(result).toContainEqual(points[2]);
  });

  it('keeps consecutive points within maxGapMeters on a long straight run', () => {
    const points = Array.from({ length: 200 }, (_, i) => [48.0, 11.0 + i * 0.0001]);
    const result = douglasPeucker(points, 5, 50);
    expect(result.length).toBeGreaterThan(2);
    for (let i = 1; i < result.length; i++) {
      expect(distanceMeters(result[i - 1], result[i])).toBeLessThanOrEqual(50);
    }
  });

  it('keeps the outlying point of a loop back to its own start', () => {
    const points = [
      [48.0, 11.0],
      [48.001, 11.0005],
      [48.0, 11.0],
    ];
    const result = douglasPeucker(points, 5);
    expect(result).toContainEqual(points[1]);
  });
});

describe('simplifyToTarget', () => {
  const straightLine = Array.from({ length: 200 }, (_, i) => [48.0, 11.0 + i * 0.0001]);

  it('returns the input unchanged when already at or below target', () => {
    const points = [
      [48.1, 11.5],
      [48.2, 11.6],
    ];
    expect(simplifyToTarget(points, 10)).toEqual(points);
  });

  it('reduces a track to roughly the requested point count', () => {
    const result = simplifyToTarget(straightLine, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.length).toBeGreaterThan(0);
  });

  it('always keeps the endpoints', () => {
    const result = simplifyToTarget(straightLine, 20);
    expect(result[0]).toEqual(straightLine[0]);
    expect(result[result.length - 1]).toEqual(straightLine[straightLine.length - 1]);
  });

  it('exceeds targetCount rather than violate maxGapMeters', () => {
    const longStraightLine = Array.from({ length: 500 }, (_, i) => [48.0, 11.0 + i * 0.0001]);
    const result = simplifyToTarget(longStraightLine, 5, 50);
    expect(result.length).toBeGreaterThan(5);
    for (let i = 1; i < result.length; i++) {
      expect(distanceMeters(result[i - 1], result[i])).toBeLessThanOrEqual(50);
    }
  });

  it('bypasses simplification for a targetCount below 2, even with far more points', () => {
    // Isolates the `targetCount < 2` half of the guard from the
    // `points.length <= targetCount` half: here only the first is true.
    const result = simplifyToTarget(straightLine, 1, Infinity);
    expect(result).toEqual(straightLine);
  });

  it('bypasses simplification exactly at targetCount 2, not just below it', () => {
    // targetCount < 2 is the real guard; at exactly 2 the guard doesn't fire,
    // so a 200-point collinear track still has to converge down to 2 through
    // the actual algorithm rather than being handed back untouched.
    const result = simplifyToTarget(straightLine, 2, Infinity);
    expect(result.length).toBe(2);
  });

  it('returns the input unchanged when points.length exactly equals targetCount', () => {
    // A boundary too fine for the straight-line fixture (which collapses to 2
    // points regardless): tiny, non-collinear deviations that the algorithm
    // would actually simplify away if the bypass didn't fire first.
    const points = [
      [48, 11],
      [48.0000001, 11.0005],
      [48, 11.001],
      [48.0000001, 11.0015],
      [48, 11.002],
    ];
    expect(simplifyToTarget(points, points.length, Infinity)).toEqual(points);
  });

  it('uses every iteration it is given to refine the epsilon search', () => {
    const wiggly = Array.from({ length: 2000 }, (_, i) => [
      48.0 + 0.01 * Math.sin(i * 0.05),
      11.0 + i * 0.0002,
    ]);
    // One extra halving of [0, 1000] after 3 iterations lands the search epsilon
    // in a completely different regime for this track (34 points vs. 98+).
    expect(simplifyToTarget(wiggly, 100, Infinity, 3).length).toBeLessThan(50);
  });
});
