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

function distanceMeters(from, to) {
  const scale = metersPerDegree(from[0]);
  return Math.hypot((to[1] - from[1]) * scale.longitude, (to[0] - from[0]) * scale.latitude);
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

function farthestFromChord(points) {
  const chord = { start: points[0], end: points[points.length - 1] };
  let maximumDistance = 0;
  let index = 0;
  for (let candidate = 1; candidate < points.length - 1; candidate++) {
    const distance = perpendicularDistanceMeters(points[candidate], chord);
    if (distance > maximumDistance) {
      maximumDistance = distance;
      index = candidate;
    }
  }
  return { index, distance: maximumDistance };
}

// A heat layer draws dots, not lines: maxGapMeters splits chords that would leave a gap.
function douglasPeucker(points, { epsilonMeters, maxGapMeters = Infinity }) {
  if (points.length < 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  const farthest = farthestFromChord(points);
  const needsSplit = farthest.distance > epsilonMeters;
  if (!needsSplit && distanceMeters(first, last) <= maxGapMeters) return [first, last];

  const splitIndex = needsSplit ? farthest.index : Math.floor(points.length / 2);
  const options = { epsilonMeters, maxGapMeters };
  const left = douglasPeucker(points.slice(0, splitIndex + 1), options);
  const right = douglasPeucker(points.slice(splitIndex), options);
  return left.slice(0, -1).concat(right);
}

const MAX_EPSILON_METERS = 1000;

// maxGapMeters wins over the budget: a long straight track can end above targetCount.
function simplifyToTarget(points, { targetCount, maxGapMeters = Infinity, maxIterations = 12 }) {
  if (targetCount < 2 || points.length <= targetCount) return points;

  let lowerEpsilon = 0;
  let upperEpsilon = MAX_EPSILON_METERS;
  let best = douglasPeucker(points, { epsilonMeters: upperEpsilon, maxGapMeters });

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const epsilonMeters = (lowerEpsilon + upperEpsilon) / 2;
    const simplified = douglasPeucker(points, { epsilonMeters, maxGapMeters });
    if (simplified.length > targetCount) {
      lowerEpsilon = epsilonMeters;
    } else {
      best = simplified;
      upperEpsilon = epsilonMeters;
    }
  }

  return best;
}

module.exports = { douglasPeucker, simplifyToTarget, distanceMeters, perpendicularDistanceMeters };
