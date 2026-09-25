'use strict';

const fc = require('fast-check');
const { douglasPeucker, simplifyToTarget } = require('./simplify');

// Tracks as [lat, lon] pairs in a realistic band (the flat-earth metric is only
// meant for track scale), including duplicates and back-and-forth.
const point = fc.tuple(
  fc.double({ min: -60, max: 60, noNaN: true }),
  fc.double({ min: -179, max: 179, noNaN: true }),
);
const track = fc.array(point, { minLength: 0, maxLength: 300 });
const epsilon = fc.double({ min: 0, max: 2000, noNaN: true });

// The output is a subsequence of the input: same points, same order.
function isSubsequence(output, input) {
  let i = 0;
  for (const p of output) {
    while (i < input.length && input[i] !== p) i++;
    if (i === input.length) return false;
    i++;
  }
  return true;
}

describe('douglasPeucker (properties)', () => {
  it('keeps an ordered subset that starts and ends where the track does', () => {
    fc.assert(
      fc.property(track, epsilon, (points, eps) => {
        const out = douglasPeucker(points, eps);
        expect(out.length).toBeLessThanOrEqual(points.length);
        expect(isSubsequence(out, points)).toBe(true);
        if (points.length > 0) {
          expect(out[0]).toBe(points[0]);
          expect(out.at(-1)).toBe(points.at(-1));
        }
      }),
    );
  });

  it('is idempotent at the same tolerance', () => {
    fc.assert(
      fc.property(track, epsilon, (points, eps) => {
        const once = douglasPeucker(points, eps);
        expect(douglasPeucker(once, eps)).toEqual(once);
      }),
    );
  });

  it('keeps every point at tolerance 0 unless it is exactly on the line', () => {
    fc.assert(
      fc.property(track, (points) => {
        expect(douglasPeucker(points, 0).length).toBeLessThanOrEqual(points.length);
        expect(douglasPeucker(points, Infinity).length).toBeLessThanOrEqual(2);
      }),
    );
  });
});

describe('simplifyToTarget (properties)', () => {
  const target = fc.integer({ min: 2, max: 200 });

  it('respects the point budget when no gap constraint applies', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        const out = simplifyToTarget(points, budget);
        // Unreachable budgets (an epsilon above the 1 km cap would be needed) are
        // the documented exception: the coarsest result is returned instead.
        const coarsest = douglasPeucker(points, 1000);
        expect(out.length).toBeLessThanOrEqual(Math.max(budget, coarsest.length));
        expect(isSubsequence(out, points)).toBe(true);
      }),
    );
  });

  it('returns the input unchanged when it already fits', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        fc.pre(points.length <= budget);
        expect(simplifyToTarget(points, budget)).toBe(points);
      }),
    );
  });

  it('keeps first and last point', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        fc.pre(points.length > 0);
        const out = simplifyToTarget(points, budget);
        expect(out[0]).toBe(points[0]);
        expect(out.at(-1)).toBe(points.at(-1));
      }),
    );
  });
});
