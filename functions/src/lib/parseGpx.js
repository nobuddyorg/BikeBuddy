// @ts-check
'use strict';

const { XMLParser } = require('fast-xml-parser');

const MAX_POINTS = 5000;
const EARTH_RADIUS_KM = 6371;

class InvalidGpxError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'InvalidGpxError';
  }
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function haversineKm([fromLatitude, fromLongitude], [toLatitude, toLongitude]) {
  const deltaLatitude = toRadians(toLatitude - fromLatitude);
  const deltaLongitude = toRadians(toLongitude - fromLongitude);
  const halfChordSquared =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) *
      Math.cos(toRadians(toLatitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return (
    EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(halfChordSquared), Math.sqrt(1 - halfChordSquared))
  );
}

function distanceAndHeatmap(points) {
  const step = Math.ceil(points.length / MAX_POINTS);
  let distanceKm = 0;
  const heatmapData = [];
  for (let index = 0; index < points.length; index++) {
    if (index > 0) distanceKm += haversineKm(points[index - 1], points[index]);
    if (index % step === 0) heatmapData.push(points[index]);
  }
  const last = points[points.length - 1];
  if (heatmapData[heatmapData.length - 1] !== last) heatmapData.push(last);
  return { distanceKm, heatmapData };
}

// Rule of thumb for consumer GPS altimeters: smaller deltas are noise.
const ELEVATION_NOISE_THRESHOLD_M = 3;

// Below this speed a segment is a stop, excluded from moving time and average speed.
const MOVING_SPEED_FLOOR_KMH = 1;

// A loop, not Math.min(...values): spreading 100k+ values overflows the stack.
function minimumAndMaximum(values) {
  let minimum = values[0];
  let maximum = values[0];
  for (const value of values) {
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return [minimum, maximum];
}

// A delta counts once it is past the threshold from the last counted elevation.
function computeElevationStats(points) {
  const elevations = points.map((point) => point.elevation).filter(Number.isFinite);
  if (elevations.length === 0) {
    return { elevationGain: null, elevationLoss: null, minElevation: null, maxElevation: null };
  }
  const [minElevation, maxElevation] = minimumAndMaximum(elevations);
  if (elevations.length < 2) {
    return { elevationGain: null, elevationLoss: null, minElevation, maxElevation };
  }

  let gain = 0;
  let loss = 0;
  let baseline = elevations[0];
  for (const elevation of elevations.slice(1)) {
    const difference = elevation - baseline;
    if (Math.abs(difference) < ELEVATION_NOISE_THRESHOLD_M) continue;
    if (difference > 0) gain += difference;
    else loss -= difference;
    baseline = elevation;
  }
  return { elevationGain: gain, elevationLoss: loss, minElevation, maxElevation };
}

function computeDurationStats(points) {
  const timed = points.filter((point) => Number.isFinite(point.time));
  if (timed.length < 2) {
    return { durationSeconds: null, movingSeconds: null, avgSpeed: null };
  }

  const elapsedSeconds = (timed[timed.length - 1].time - timed[0].time) / 1000;
  let movingSeconds = 0;
  let movingDistanceKm = 0;
  for (let index = 1; index < timed.length; index++) {
    const previous = timed[index - 1];
    const current = timed[index];
    const segmentSeconds = (current.time - previous.time) / 1000;
    if (segmentSeconds <= 0) continue;
    const segmentKm = haversineKm(
      [previous.latitude, previous.longitude],
      [current.latitude, current.longitude],
    );
    if (segmentKm / (segmentSeconds / 3600) < MOVING_SPEED_FLOOR_KMH) continue;
    movingSeconds += segmentSeconds;
    movingDistanceKm += segmentKm;
  }

  return {
    durationSeconds: Math.round(elapsedSeconds),
    movingSeconds: Math.round(movingSeconds),
    avgSpeed: movingSeconds > 0 ? movingDistanceKm / (movingSeconds / 3600) : null,
  };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// Also rejects NaN, which would poison the distance; bounds match extractGps.js.
const isValidPoint = ({ latitude, longitude }) =>
  latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

// fast-xml-parser yields an object for one element, an array for several, undefined for none.
function toArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function toTrackPoint(element) {
  return {
    latitude: parseFloat(element['@_lat']),
    longitude: parseFloat(element['@_lon']),
    elevation: parseFloat(element.ele),
    time: Date.parse(element.time),
  };
}

function trackPoints(tracks) {
  return tracks
    .flatMap((track) =>
      toArray(track.trkseg).flatMap((segment) => toArray(segment.trkpt).map(toTrackPoint)),
    )
    .filter(isValidPoint);
}

function parseDocument(input) {
  let document;
  try {
    document = parser.parse(input);
  } catch (error) {
    throw new InvalidGpxError('Not a valid GPX file', { cause: error });
  }
  if (!document.gpx) throw new InvalidGpxError('Not a valid GPX file');
  return document.gpx;
}

/**
 * Elevation and duration are null, not 0, without <ele>/<time>: the frontend shows "unknown".
 *
 * @param {string|Buffer} input
 * @returns {{
 *   name: string|null, date: string|null,
 *   distanceKm: number, heatmapData: [number,number][],
 *   elevationGain: number|null, elevationLoss: number|null,
 *   minElevation: number|null, maxElevation: number|null,
 *   durationSeconds: number|null, movingSeconds: number|null,
 *   avgSpeed: number|null,
 * }}
 */
function parseGpx(input) {
  const gpx = parseDocument(input);
  const tracks = toArray(gpx.trk);
  const name = gpx.metadata?.name || tracks[0]?.name || null;

  const firstPoint = toArray(toArray(tracks[0]?.trkseg)[0]?.trkpt)[0];
  const time = gpx.metadata?.time || firstPoint?.time || null;
  const date = time ? new Date(time).toISOString() : null;

  const points = trackPoints(tracks);
  const { distanceKm, heatmapData } = distanceAndHeatmap(
    points.map((point) => [point.latitude, point.longitude]),
  );

  return {
    name,
    date,
    distanceKm,
    heatmapData,
    ...computeElevationStats(points),
    ...computeDurationStats(points),
  };
}

module.exports = { parseGpx, InvalidGpxError };
