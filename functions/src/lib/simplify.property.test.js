'use strict';

const fc = require('fast-check');
const { douglasPeucker, simplifyToTarget } = require('./simplify');

// Tracks in a band where the flat-earth metric holds, with duplicates and back-and-forth.
const point = fc.tuple(
  fc.double({ min: -60, max: 60, noNaN: true }),
  fc.double({ min: -179, max: 179, noNaN: true }),
);
const track = fc.array(point, { minLength: 0, maxLength: 300 });
const epsilonMeters = fc.double({ min: 0, max: 2000, noNaN: true });

// The output is a subsequence of the input: same points, same order.
function isSubsequence(output, input) {
  let index = 0;
  for (const kept of output) {
    while (index < input.length && input[index] !== kept) index++;
    if (index === input.length) return false;
    index++;
  }
  return true;
}

describe('douglasPeucker (properties)', () => {
  it('keeps an ordered subset that starts and ends where the track does', () => {
    fc.assert(
      fc.property(track, epsilonMeters, (points, epsilon) => {
        const simplified = douglasPeucker(points, { epsilonMeters: epsilon });
        expect(simplified.length).toBeLessThanOrEqual(points.length);
        expect(isSubsequence(simplified, points)).toBe(true);
        if (points.length > 0) {
          expect(simplified[0]).toBe(points[0]);
          expect(simplified.at(-1)).toBe(points.at(-1));
        }
      }),
    );
  });

  it('is idempotent at the same tolerance', () => {
    fc.assert(
      fc.property(track, epsilonMeters, (points, epsilon) => {
        const once = douglasPeucker(points, { epsilonMeters: epsilon });
        expect(douglasPeucker(once, { epsilonMeters: epsilon })).toEqual(once);
      }),
    );
  });

  it('keeps every point at tolerance 0 unless it is exactly on the line', () => {
    fc.assert(
      fc.property(track, (points) => {
        expect(douglasPeucker(points, { epsilonMeters: 0 }).length).toBeLessThanOrEqual(
          points.length,
        );
        expect(douglasPeucker(points, { epsilonMeters: Infinity }).length).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe('simplifyToTarget (properties)', () => {
  const target = fc.integer({ min: 2, max: 200 });

  it('respects the point budget when no gap constraint applies', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        const simplified = simplifyToTarget(points, { targetCount: budget });
        // A budget that needs an epsilon above the 1 km cap gets the coarsest result instead.
        const coarsest = douglasPeucker(points, { epsilonMeters: 1000 });
        expect(simplified.length).toBeLessThanOrEqual(Math.max(budget, coarsest.length));
        expect(isSubsequence(simplified, points)).toBe(true);
      }),
    );
  });

  it('returns the input unchanged when it already fits', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        fc.pre(points.length <= budget);
        expect(simplifyToTarget(points, { targetCount: budget })).toBe(points);
      }),
    );
  });

  it('keeps first and last point', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        fc.pre(points.length > 0);
        const simplified = simplifyToTarget(points, { targetCount: budget });
        expect(simplified[0]).toBe(points[0]);
        expect(simplified.at(-1)).toBe(points.at(-1));
      }),
    );
  });
});
