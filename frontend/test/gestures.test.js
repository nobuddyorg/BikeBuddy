import { describe, it, expect } from 'vitest';
import { clampSwipe, exceedsTolerance, isVerticalIntent } from '../src/lib/gestures.js';

describe('isVerticalIntent', () => {
  it('reads a mostly vertical drag as a scroll', () => {
    expect(isVerticalIntent({ dx: 3, dy: -10 })).toBe(true);
  });

  it('reads a horizontal or exactly diagonal drag as a swipe', () => {
    expect(isVerticalIntent({ dx: -10, dy: 3 })).toBe(false);
    expect(isVerticalIntent({ dx: 5, dy: 5 })).toBe(false);
  });
});

describe('clampSwipe', () => {
  it('follows the finger to the right, up to the limit', () => {
    expect(clampSwipe({ dx: 30, maxDx: 100 })).toBe(30);
    expect(clampSwipe({ dx: 300, maxDx: 100 })).toBe(100);
  });

  it('never moves the row to the left', () => {
    expect(clampSwipe({ dx: -30, maxDx: 100 })).toBe(0);
  });
});

describe('exceedsTolerance', () => {
  it('measures the straight-line distance', () => {
    expect(exceedsTolerance({ dx: 6, dy: 8, tolerancePx: 10 })).toBe(false);
    expect(exceedsTolerance({ dx: 6, dy: 8.1, tolerancePx: 10 })).toBe(true);
  });
});
