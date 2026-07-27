'use strict';

// Flat-earth approximation, fine at track scale.
function metersPerDegree(lat) {
  const latRad = (lat * Math.PI) / 180;
  return { lat: 111320, lon: 111320 * Math.cos(latRad) };
}

function distanceMeters(a, b) {
  const { lat: mLat, lon: mLon } = metersPerDegree(a[0]);
  return Math.hypot((b[1] - a[1]) * mLon, (b[0] - a[0]) * mLat);
}

function perpendicularDistanceMeters(point, a, b) {
  const { lat: mLat, lon: mLon } = metersPerDegree(a[0]);
  const px = (point[1] - a[1]) * mLon;
  const py = (point[0] - a[0]) * mLat;
  const bx = (b[1] - a[1]) * mLon;
  const by = (b[0] - a[0]) * mLat;

  const bLenSq = bx * bx + by * by;
  if (bLenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / bLenSq));
  return Math.hypot(px - t * bx, py - t * by);
}

// Ramer-Douglas-Peucker simplification. `maxGapMeters` exists because a heat
// layer draws a dot per point rather than a connecting line, so collapsing a
// straight stretch to just its two endpoints (what plain RDP would do) leaves
// a visible gap instead of a thinner line — this forces a split once
// consecutive kept points would end up farther apart than that.
function douglasPeucker(points, epsilonMeters, maxGapMeters = Infinity) {
  if (points.length < 3) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistanceMeters(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  const needsSplit = maxDist > epsilonMeters;
  if (!needsSplit && distanceMeters(first, last) <= maxGapMeters) return [first, last];

  const splitIndex = needsSplit ? index : Math.floor(points.length / 2);
  const left = douglasPeucker(points.slice(0, splitIndex + 1), epsilonMeters, maxGapMeters);
  const right = douglasPeucker(points.slice(splitIndex), epsilonMeters, maxGapMeters);
  return left.slice(0, -1).concat(right);
}

const MAX_EPSILON_METERS = 1000;

// Binary-searches an epsilon that brings `points` down to roughly
// `targetCount` via Douglas-Peucker. `maxGapMeters` can make the result
// exceed `targetCount` on long straight tracks — gap constraint wins over
// exact budget adherence.
function simplifyToTarget(points, targetCount, maxGapMeters = Infinity, maxIterations = 12) {
  if (targetCount < 2 || points.length <= targetCount) return points;

  let lo = 0;
  let hi = MAX_EPSILON_METERS;
  let best = douglasPeucker(points, hi, maxGapMeters);

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const simplified = douglasPeucker(points, mid, maxGapMeters);
    if (simplified.length > targetCount) {
      lo = mid;
    } else {
      best = simplified;
      hi = mid;
    }
  }

  return best;
}

module.exports = { douglasPeucker, simplifyToTarget, distanceMeters };
