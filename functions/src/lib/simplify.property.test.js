'use strict';

const fc = require('fast-check');
const { simplifyToTarget } = require('./simplify');

// Tracks in a band where the flat-earth metric holds, with duplicates and back-and-forth.
const point = fc.tuple(
  fc.double({ min: -60, max: 60, noNaN: true }),
  fc.double({ min: -179, max: 179, noNaN: true }),
);
const track = fc.array(point, { minLength: 0, maxLength: 300 });
const target = fc.integer({ min: 2, max: 200 });

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

describe('simplifyToTarget (properties)', () => {
  it('returns exactly the budget, or the whole track when it fits', () => {
    fc.assert(
      fc.property(track, target, (points, budget) => {
        const simplified = simplifyToTarget(points, { targetCount: budget });
        expect(simplified).toHaveLength(Math.min(budget, points.length));
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

  it('keeps every point a smaller budget keeps', () => {
    fc.assert(
      fc.property(track, target, target, (points, first, second) => {
        const [smaller, larger] = [first, second].sort((left, right) => left - right);
        const kept = new Set(simplifyToTarget(points, { targetCount: larger }));
        for (const point of simplifyToTarget(points, { targetCount: smaller })) {
          expect(kept.has(point)).toBe(true);
        }
      }),
    );
  });
});
