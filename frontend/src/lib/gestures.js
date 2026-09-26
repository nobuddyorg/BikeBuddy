// @ts-check

// A mostly vertical drag is a scroll, which the browser owns.
export function isVerticalIntent({ dx, dy }) {
  return Math.abs(dy) > Math.abs(dx);
}

// Only the delete background exists, to the right, so a row never moves left.
export function clampSwipe({ dx, maxDx }) {
  return Math.max(0, Math.min(maxDx, dx));
}

export function exceedsTolerance({ dx, dy, tolerancePx }) {
  return Math.hypot(dx, dy) > tolerancePx;
}
