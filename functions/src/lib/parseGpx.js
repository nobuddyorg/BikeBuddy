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

// Well-formed GPX, but not one valid track or route point to show.
class NoTrackPointsError extends InvalidGpxError {
  constructor() {
    super('GPX file has no track points');
    this.name = 'NoTrackPointsError';
  }
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function haversineKm(from, to) {
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const halfChordSquared =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return (
    EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(halfChordSquared), Math.sqrt(1 - halfChordSquared))
  );
}

const sum = (values) => values.reduce((total, value) => total + value, 0);

function pathLengthKm(points) {
  let distanceKm = 0;
  for (let index = 1; index < points.length; index++) {
    distanceKm += haversineKm(points[index - 1], points[index]);
  }
  return distanceKm;
}

// Every step-th point plus the last, so the line still ends where the ride did.
function downsample(points) {
  const step = Math.ceil(points.length / MAX_POINTS);
  const kept = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept.map((point) => [point.latitude, point.longitude]);
}

// Rule of thumb for consumer GPS altimeters: smaller deltas are noise.
const ELEVATION_NOISE_THRESHOLD_M = 3;

// Below this speed a leg is a stop, excluded from moving time and average speed.
const MOVING_SPEED_FLOOR_KMH = 1;

// A loop, not Math.min(...values): spreading 100k+ values overflows the stack.
function minimumAndMaximum(values) {
  let minimum = values[0];
  let maximum = values[0];
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return [minimum, maximum];
}

const elevationsOf = (points) => points.map((point) => point.elevation).filter(Number.isFinite);

// A delta counts once it is past the threshold from the last counted elevation.
function gainAndLoss(elevations) {
  let gain = 0;
  let loss = 0;
  let baseline = elevations[0];
  for (const elevation of elevations) {
    const difference = elevation - baseline;
    if (Math.abs(difference) < ELEVATION_NOISE_THRESHOLD_M) continue;
    gain += Math.max(difference, 0);
    loss += Math.max(-difference, 0);
    baseline = elevation;
  }
  return { gain, loss };
}

// Per segment: the climb between two segments was not ridden.
function computeElevationStats(segments) {
  const elevations = elevationsOf(segments.flat());
  if (elevations.length === 0) {
    return { elevationGain: null, elevationLoss: null, minElevation: null, maxElevation: null };
  }
  const [minElevation, maxElevation] = minimumAndMaximum(elevations);
  if (elevations.length < 2) {
    return { elevationGain: null, elevationLoss: null, minElevation, maxElevation };
  }
  const perSegment = segments.map((segment) => gainAndLoss(elevationsOf(segment)));
  return {
    elevationGain: sum(perSegment.map(({ gain }) => gain)),
    elevationLoss: sum(perSegment.map(({ loss }) => loss)),
    minElevation,
    maxElevation,
  };
}

const timedPoints = (points) => points.filter((point) => Number.isFinite(point.time));

function movingLegs(segment) {
  const timed = timedPoints(segment);
  const legs = [];
  for (let index = 1; index < timed.length; index++) {
    const previous = timed[index - 1];
    const current = timed[index];
    const seconds = (current.time - previous.time) / 1000;
    if (seconds <= 0) continue;
    const kilometres = haversineKm(previous, current);
    if (kilometres / (seconds / 3600) < MOVING_SPEED_FLOOR_KMH) continue;
    legs.push({ seconds, kilometres });
  }
  return legs;
}

// Elapsed spans the earliest to the latest time, whatever order the file lists them in.
function computeDurationStats(segments) {
  const times = timedPoints(segments.flat()).map((point) => point.time);
  if (times.length < 2) {
    return { durationSeconds: null, movingSeconds: null, avgSpeed: null };
  }
  const [earliest, latest] = minimumAndMaximum(times);
  const legs = segments.flatMap(movingLegs);
  const movingSeconds = sum(legs.map(({ seconds }) => seconds));
  const movingDistanceKm = sum(legs.map(({ kilometres }) => kilometres));

  return {
    durationSeconds: Math.round((latest - earliest) / 1000),
    movingSeconds: Math.round(movingSeconds),
    avgSpeed: movingSeconds > 0 ? movingDistanceKm / (movingSeconds / 3600) : null,
  };
}

// Text stays text: `<name>20240512</name>` must not become a number.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
});

// Also rejects NaN, which would poison the distance; bounds match extractGps.js.
const isValidPoint = ({ latitude, longitude }) =>
  latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

// fast-xml-parser yields an object for one element, an array for several, undefined for none.
function toArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

// An element with attributes or children parses to an object holding its text as '#text'.
function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value?.['#text'] === 'string') return value['#text'];
  return '';
}

function toPoint(element) {
  return {
    latitude: parseFloat(element['@_lat']),
    longitude: parseFloat(element['@_lon']),
    elevation: parseFloat(textOf(element.ele)),
    time: Date.parse(textOf(element.time)),
  };
}

const validPoints = (elements) => toArray(elements).map(toPoint).filter(isValidPoint);
const nonEmpty = (segment) => segment.length > 0;

// A planner's export holds only <rte>; a track, when there is one, is what was ridden.
function pointSegments(gpx) {
  const trackSegments = toArray(gpx.trk)
    .flatMap((track) => toArray(track.trkseg).map((segment) => validPoints(segment.trkpt)))
    .filter(nonEmpty);
  if (trackSegments.length > 0) return trackSegments;
  const routes = toArray(gpx.rte)
    .map((route) => validPoints(route.rtept))
    .filter(nonEmpty);
  if (routes.length > 0) return routes;
  throw new NoTrackPointsError();
}

// One unreadable <time> leaves the date to the points instead of rejecting the file.
function tourDate(gpx, points) {
  const metadataTime = Date.parse(textOf(gpx.metadata?.time));
  if (Number.isFinite(metadataTime)) return new Date(metadataTime).toISOString();
  const times = timedPoints(points).map((point) => point.time);
  if (times.length === 0) return null;
  return new Date(minimumAndMaximum(times)[0]).toISOString();
}

function parseDocument(input) {
  let document;
  try {
    document = parser.parse(input);
  } catch (error) {
    throw new InvalidGpxError('Not a valid GPX file', { cause: error });
  }
  if (document.gpx === undefined) throw new InvalidGpxError('Not a valid GPX file');
  // An empty <gpx/> parses to '', which has no elements to read, like any text.
  return document.gpx;
}

/**
 * Elevation and duration are null, not 0, without <ele>/<time>: the frontend shows "unknown".
 * Distance, moving time and climb add up within each segment, never across the gap between two.
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
  const [firstTrack] = toArray(gpx.trk);
  const name = textOf(gpx.metadata?.name) || textOf(firstTrack?.name) || null;

  const segments = pointSegments(gpx);
  const points = segments.flat();

  return {
    name,
    date: tourDate(gpx, points),
    distanceKm: sum(segments.map(pathLengthKm)),
    heatmapData: downsample(points),
    ...computeElevationStats(segments),
    ...computeDurationStats(segments),
  };
}

module.exports = { parseGpx, InvalidGpxError, NoTrackPointsError };
