'use strict';

const {
  douglasPeucker,
  simplifyToTarget,
  distanceMeters,
  perpendicularDistanceMeters,
} = require('./simplify');

describe('distanceMeters', () => {
  it('measures a pure latitude difference with the latitude scale', () => {
    expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111320, 0);
  });
});

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
});

describe('douglasPeucker', () => {
  it('leaves short tracks untouched', () => {
    const points = [
      [48.1, 11.5],
      [48.2, 11.6],
    ];
    expect(douglasPeucker(points, { epsilonMeters: 10 })).toEqual(points);
  });

  it('returns a single point unchanged rather than duplicating it', () => {
    expect(douglasPeucker([[1, 2]], { epsilonMeters: 5 })).toEqual([[1, 2]]);
  });

  it('drops the middle of exactly three collinear points', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.0, 11.002],
    ];
    expect(douglasPeucker(points, { epsilonMeters: 50 })).toEqual([points[0], points[2]]);
  });

  it('picks the point with the largest perpendicular distance, not the last one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.003];
    const bigDeviation = [0.002, 0.001];
    const smallDeviation = [0.0005, 0.002];
    const result = douglasPeucker([first, bigDeviation, smallDeviation, last], {
      epsilonMeters: 60,
    });
    expect(result).toEqual([first, bigDeviation, last]);
  });

  it('breaks a tie between two equally-distant points in favor of the first one scanned', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const tiedFirst = [0.001, 0.0005];
    const tiedSecond = [0.001, 0.0015];
    const result = douglasPeucker([first, tiedFirst, tiedSecond, last], { epsilonMeters: 80 });
    expect(result).toEqual([first, tiedFirst, last]);
  });

  it('does not split when the max perpendicular distance exactly equals epsilon', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const mid = [0.001, 0.001];
    const epsilonMeters = perpendicularDistanceMeters(mid, { start: first, end: last });
    expect(douglasPeucker([first, mid, last], { epsilonMeters })).toEqual([first, last]);
  });

  it('collapses to the endpoints when the gap exactly equals maxGapMeters', () => {
    const first = [0, 0];
    const last = [0, 0.002];
    const mid = [0.001, 0.001];
    const maxGapMeters = distanceMeters(first, last);
    expect(douglasPeucker([first, mid, last], { epsilonMeters: 100000, maxGapMeters })).toEqual([
      first,
      last,
    ]);
  });

  it('collapses points that sit on a straight line', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.0, 11.002],
      [48.0, 11.003],
      [48.0, 11.004],
    ];
    const result = douglasPeucker(points, { epsilonMeters: 5 });
    expect(result).toEqual([points[0], points[points.length - 1]]);
  });

  it('keeps a point that marks a real turn', () => {
    const points = [
      [48.0, 11.0],
      [48.0, 11.001],
      [48.01, 11.001],
      [48.01, 11.002],
    ];
    const result = douglasPeucker(points, { epsilonMeters: 5 });
    expect(result).toContainEqual(points[2]);
  });

  it('keeps consecutive points within maxGapMeters on a long straight run', () => {
    const points = Array.from({ length: 200 }, (_, i) => [48.0, 11.0 + i * 0.0001]);
    const result = douglasPeucker(points, { epsilonMeters: 5, maxGapMeters: 50 });
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
    const result = douglasPeucker(points, { epsilonMeters: 5 });
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
    expect(simplifyToTarget(points, { targetCount: 10 })).toEqual(points);
  });

  it('reduces a track to roughly the requested point count', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 20 });
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.length).toBeGreaterThan(0);
  });

  it('always keeps the endpoints', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 20 });
    expect(result[0]).toEqual(straightLine[0]);
    expect(result[result.length - 1]).toEqual(straightLine[straightLine.length - 1]);
  });

  it('exceeds targetCount rather than violate maxGapMeters', () => {
    const longStraightLine = Array.from({ length: 500 }, (_, i) => [48.0, 11.0 + i * 0.0001]);
    const result = simplifyToTarget(longStraightLine, { targetCount: 5, maxGapMeters: 50 });
    expect(result.length).toBeGreaterThan(5);
    for (let i = 1; i < result.length; i++) {
      expect(distanceMeters(result[i - 1], result[i])).toBeLessThanOrEqual(50);
    }
  });

  it('returns the input unchanged for a target below two points', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 1 });
    expect(result).toEqual(straightLine);
  });

  it('simplifies a straight track down to its two endpoints for a target of two', () => {
    const result = simplifyToTarget(straightLine, { targetCount: 2 });
    expect(result.length).toBe(2);
  });

  it('returns the input unchanged when it has exactly the target count', () => {
    // Tiny deviations that simplification would drop if it ran.
    const points = [
      [48, 11],
      [48.0000001, 11.0005],
      [48, 11.001],
      [48.0000001, 11.0015],
      [48, 11.002],
    ];
    expect(simplifyToTarget(points, { targetCount: points.length })).toEqual(points);
  });

  it('uses every iteration it is given to refine the epsilon search', () => {
    const wiggly = Array.from({ length: 2000 }, (_, i) => [
      48.0 + 0.01 * Math.sin(i * 0.05),
      11.0 + i * 0.0002,
    ]);
    // After three halvings of [0, 1000] the search lands on 34 points; a fourth would give 98+.
    expect(simplifyToTarget(wiggly, { targetCount: 100, maxIterations: 3 }).length).toBeLessThan(
      50,
    );
  });
});
