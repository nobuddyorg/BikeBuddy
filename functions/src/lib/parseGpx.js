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

/**
 * Every step-th point plus the last, so the line still ends where the ride did.
 *
 * @param {{ latitude: number, longitude: number }[]} points
 * @returns {[number, number][]}
 */
function downsample(points) {
  const step = Math.ceil(points.length / MAX_POINTS);
  const kept = [];
  for (let index = 0; index < points.length; index += step) kept.push(points[index]);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept.map(({ latitude, longitude }) => [latitude, longitude]);
}

// Rule of thumb for consumer GPS altimeters: smaller deltas are noise.
const ELEVATION_NOISE_THRESHOLD_M = 3;

// Below this speed a leg is a stop, excluded from moving time and average speed.
const MOVING_SPEED_FLOOR_KMH = 1;

const emptyRange = () => ({ count: 0, minimum: Infinity, maximum: -Infinity });

// Compared one by one: Math.min(...values) overflows the stack past about 130k values.
function widen(range, value) {
  if (!Number.isFinite(value)) return;
  range.count += 1;
  range.minimum = Math.min(range.minimum, value);
  range.maximum = Math.max(range.maximum, value);
}

// Elevation and time ranges in one pass over the whole track.
function rangesOf(points) {
  const ranges = { elevation: emptyRange(), time: emptyRange() };
  for (const point of points) {
    widen(ranges.elevation, point.elevation);
    widen(ranges.time, point.time);
  }
  return ranges;
}

// A delta counts once it is past the threshold from the last counted elevation.
function gainAndLoss(segment) {
  let gain = 0;
  let loss = 0;
  let baseline;
  for (const { elevation } of segment) {
    if (!Number.isFinite(elevation)) continue;
    baseline ??= elevation;
    const difference = elevation - baseline;
    if (Math.abs(difference) < ELEVATION_NOISE_THRESHOLD_M) continue;
    gain += Math.max(difference, 0);
    loss += Math.max(-difference, 0);
    baseline = elevation;
  }
  return { gain, loss };
}

// Per segment: the climb between two segments was not ridden.
function elevationStats(segments, range) {
  if (range.count === 0) {
    return { elevationGain: null, elevationLoss: null, minElevation: null, maxElevation: null };
  }
  const extremes = { minElevation: range.minimum, maxElevation: range.maximum };
  if (range.count < 2) return { elevationGain: null, elevationLoss: null, ...extremes };
  const perSegment = segments.map(gainAndLoss);
  return {
    elevationGain: sum(perSegment.map(({ gain }) => gain)),
    elevationLoss: sum(perSegment.map(({ loss }) => loss)),
    ...extremes,
  };
}

function addLeg(totals, from, to) {
  const seconds = (to.time - from.time) / 1000;
  if (seconds <= 0) return;
  const kilometres = haversineKm(from, to);
  if (kilometres / (seconds / 3600) < MOVING_SPEED_FLOOR_KMH) return;
  totals.seconds += seconds;
  totals.kilometres += kilometres;
}

// Legs join consecutive timed points of one segment; untimed points in between are skipped.
function movingTotals(segment) {
  const totals = { seconds: 0, kilometres: 0 };
  let previous;
  for (const point of segment) {
    if (!Number.isFinite(point.time)) continue;
    if (previous) addLeg(totals, previous, point);
    previous = point;
  }
  return totals;
}

// Elapsed spans the earliest to the latest time, whatever order the file lists them in.
function durationStats(segments, range) {
  if (range.count < 2) {
    return { durationSeconds: null, movingSeconds: null, avgSpeed: null };
  }
  const perSegment = segments.map(movingTotals);
  const movingSeconds = sum(perSegment.map(({ seconds }) => seconds));
  const movingDistanceKm = sum(perSegment.map(({ kilometres }) => kilometres));

  return {
    durationSeconds: Math.round((range.maximum - range.minimum) / 1000),
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
function tourDate(gpx, timeRange) {
  const metadataTime = Date.parse(textOf(gpx.metadata?.time));
  if (Number.isFinite(metadataTime)) return new Date(metadataTime).toISOString();
  if (timeRange.count === 0) return null;
  return new Date(timeRange.minimum).toISOString();
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
  const ranges = rangesOf(points);

  return {
    name,
    date: tourDate(gpx, ranges.time),
    distanceKm: sum(segments.map(pathLengthKm)),
    heatmapData: downsample(points),
    ...elevationStats(segments, ranges.elevation),
    ...durationStats(segments, ranges.time),
  };
}

module.exports = { parseGpx, InvalidGpxError, NoTrackPointsError };
