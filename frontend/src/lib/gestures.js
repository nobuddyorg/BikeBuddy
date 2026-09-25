// @ts-check

// A drag that moves more vertically than horizontally is a scroll, which the
// browser owns, not a swipe.
export function isVerticalIntent({ dx, dy }) {
  return Math.abs(dy) > Math.abs(dx);
}

// A tour row only ever reveals its delete background, to the right, and never
// further than maxDx.
export function clampSwipe({ dx, maxDx }) {
  return Math.max(0, Math.min(maxDx, dx));
}

export function exceedsTolerance({ dx, dy, tolerancePx }) {
  return Math.hypot(dx, dy) > tolerancePx;
}
