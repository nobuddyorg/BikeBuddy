// @ts-check
'use strict';

const METERS_PER_DEGREE_LATITUDE = 111320;

// Flat-earth approximation, fine at track scale.
function metersPerDegree(latitude) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  return {
    latitude: METERS_PER_DEGREE_LATITUDE,
    longitude: METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeRadians),
  };
}

function perpendicularDistanceMeters(point, { start, end }) {
  const scale = metersPerDegree(start[0]);
  const pointX = (point[1] - start[1]) * scale.longitude;
  const pointY = (point[0] - start[0]) * scale.latitude;
  const segmentX = (end[1] - start[1]) * scale.longitude;
  const segmentY = (end[0] - start[0]) * scale.latitude;

  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return Math.hypot(pointX, pointY);

  const projection = Math.max(
    0,
    Math.min(1, (pointX * segmentX + pointY * segmentY) / segmentLengthSquared),
  );
  return Math.hypot(pointX - projection * segmentX, pointY - projection * segmentY);
}

function farthestFromChord(points, { start, end }) {
  const chord = { start: points[start], end: points[end] };
  let maximumDistance = 0;
  let index = start + 1;
  for (let candidate = start + 1; candidate < end; candidate++) {
    const distance = perpendicularDistanceMeters(points[candidate], chord);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      index = candidate;
    }
  }
  return { index, distance: maximumDistance };
}

/**
 * Douglas-Peucker in one pass: each point's rank is the largest tolerance at which the algorithm
 * still keeps it, capped by the rank of the split that exposed it, so a kept point's ancestors are
 * kept too. The endpoints rank Infinity.
 */
function douglasPeuckerRanks(points) {
  const ranks = new Float64Array(points.length);
  ranks[0] = Infinity;
  ranks[points.length - 1] = Infinity;
  const pending = [{ start: 0, end: points.length - 1, cap: Infinity }];
  while (pending.length > 0) {
    const { start, end, cap } = /** @type {{ start: number, end: number, cap: number }} */ (
      pending.pop()
    );
    if (end - start < 2) continue;
    const farthest = farthestFromChord(points, { start, end });
    const rank = Math.min(farthest.distance, cap);
    ranks[farthest.index] = rank;
    pending.push(
      { start, end: farthest.index, cap: rank },
      { start: farthest.index, end, cap: rank },
    );
  }
  return ranks;
}

// Exactly targetCount points: the ones Douglas-Peucker keeps longest as its tolerance grows.
function simplifyToTarget(points, { targetCount }) {
  if (targetCount < 2 || points.length <= targetCount) return points;
  const ranks = douglasPeuckerRanks(points);
  // A stable sort over ascending indices keeps the earliest of equally ranked points.
  const keptIndices = points
    .map((_, index) => index)
    .sort((left, right) => ranks[right] - ranks[left])
    .slice(0, targetCount)
    .sort((left, right) => left - right);
  return keptIndices.map((index) => points[index]);
}

module.exports = { simplifyToTarget, perpendicularDistanceMeters };
