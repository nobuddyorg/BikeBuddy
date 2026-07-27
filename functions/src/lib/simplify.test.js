'use strict';

const { douglasPeucker, simplifyToTarget, distanceMeters } = require('./simplify');

describe('douglasPeucker', () => {
  it('leaves short tracks untouched', () => {
    const points = [
      [48.1, 11.5],
      [48.2, 11.6],
    ];
    expect(douglasPeucker(points, 10)).toEqual(points);
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
});
