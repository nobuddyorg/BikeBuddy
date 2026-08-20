'use strict';

const { XMLParser } = require('fast-xml-parser');

const MAX_POINTS = 5000;

// Haversine distance in km between two lat/lon points.
function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// One pass: distance and downsampling together.
function processPoints(points) {
  if (points.length === 0) return { distanceKm: 0, heatmapData: [] };
  const step = points.length > MAX_POINTS ? Math.ceil(points.length / MAX_POINTS) : 1;
  let distanceKm = 0;
  const heatmapData = [];
  for (let i = 0; i < points.length; i++) {
    if (i > 0) distanceKm += haversineKm(points[i - 1], points[i]);
    if (i % step === 0) heatmapData.push(points[i]);
  }
  const last = points[points.length - 1];
  if (heatmapData[heatmapData.length - 1] !== last) heatmapData.push(last);
  return { distanceKm, heatmapData };
}

// Elevation deltas below this are GPS/barometric noise, not real climbing —
// the usual rule of thumb for consumer GPS altimeters.
const ELEVATION_NOISE_THRESHOLD_M = 3;

// Below this speed a point counts as a stop, not riding — excluded from
// "moving time" and the average-speed figure it feeds.
const MOVING_SPEED_FLOOR_KMH = 1;

// Cumulative gain/loss with a noise floor: only counts a delta once it moves
// ELEVATION_NOISE_THRESHOLD_M away from the last accepted elevation, so GPS
// jitter around a plateau doesn't accumulate into fake climbing.
function computeElevationStats(points, thresholdM = ELEVATION_NOISE_THRESHOLD_M) {
  const elevations = points.map((p) => p.ele).filter(Number.isFinite);
  if (elevations.length === 0) {
    return { elevationGain: null, elevationLoss: null, minElevation: null, maxElevation: null };
  }
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  if (elevations.length < 2) {
    return { elevationGain: null, elevationLoss: null, minElevation, maxElevation };
  }

  let gain = 0;
  let loss = 0;
  let baseline = elevations[0];
  for (let i = 1; i < elevations.length; i++) {
    const diff = elevations[i] - baseline;
    if (Math.abs(diff) >= thresholdM) {
      if (diff > 0) gain += diff;
      else loss += -diff;
      baseline = elevations[i];
    }
  }
  return { elevationGain: gain, elevationLoss: loss, minElevation, maxElevation };
}

// Elapsed = first to last timestamp. Moving = elapsed minus time spent below
// MOVING_SPEED_FLOOR_KMH, so a lunch stop doesn't count as riding time or
// drag down the average speed.
function computeDurationStats(points, movingSpeedFloorKmh = MOVING_SPEED_FLOOR_KMH) {
  const timed = points.filter((p) => Number.isFinite(p.time));
  if (timed.length < 2) {
    return { durationSeconds: null, movingSeconds: null, avgSpeed: null };
  }

  const elapsedSeconds = (timed[timed.length - 1].time - timed[0].time) / 1000;
  let movingSeconds = 0;
  let movingDistanceKm = 0;
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const curr = timed[i];
    const dtSec = (curr.time - prev.time) / 1000;
    if (dtSec <= 0) continue;
    const segKm = haversineKm([prev.lat, prev.lon], [curr.lat, curr.lon]);
    const speedKmh = segKm / (dtSec / 3600);
    if (speedKmh >= movingSpeedFloorKmh) {
      movingSeconds += dtSec;
      movingDistanceKm += segKm;
    }
  }

  return {
    durationSeconds: Math.round(elapsedSeconds),
    movingSeconds: Math.round(movingSeconds),
    avgSpeed: movingSeconds > 0 ? movingDistanceKm / (movingSeconds / 3600) : null,
  };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// One <trkpt> with a missing or non-numeric lat/lon poisons the whole tour: NaN
// flows into the distance accumulator and reaches Leaflet's fitBounds as
// [null, null], breaking the map. Bounds match the EXIF check in extractGps.js.
const isValidPoint = ([lat, lon]) =>
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180;

// fast-xml-parser yields an object, an array, or undefined for a repeated
// element.
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * Parse a GPX string or Buffer and return tour metadata + heatmap points.
 * Handles multiple <trk> and <trkseg> elements; downsamples to ≤ 5,000 points.
 * Elevation and duration fields are null (not 0) when the file carries no
 * <ele>/<time> — that distinction is the point, not just a fallback.
 *
 * @param {string|Buffer} gpxInput
 * @returns {{
 *   name: string|null, date: string|null,
 *   distanceKm: number, heatmapData: [number,number][],
 *   elevationGain: number|null, elevationLoss: number|null,
 *   minElevation: number|null, maxElevation: number|null,
 *   durationSeconds: number|null, movingSeconds: number|null,
 *   avgSpeed: number|null,
 * }}
 */
function parseGpx(gpxInput) {
  if (Buffer.isBuffer(gpxInput)) gpxInput = gpxInput.toString('utf8');
  const doc = parser.parse(gpxInput);
  const gpx = doc?.gpx;
  if (!gpx) throw new Error('Not a valid GPX file');

  // GPX allows multiple <trk>, <trkseg> and <trkpt> elements.
  const tracks = toArray(gpx.trk);
  const name = gpx.metadata?.name || tracks[0]?.name || null;

  const firstPt = toArray(toArray(tracks[0]?.trkseg)[0]?.trkpt)[0];
  const time = gpx.metadata?.time || firstPt?.time || null;
  const date = time ? new Date(time).toISOString() : null;

  const validPoints = tracks
    .flatMap((trk) =>
      toArray(trk.trkseg).flatMap((seg) =>
        toArray(seg.trkpt).map((pt) => ({
          lat: parseFloat(pt['@_lat']),
          lon: parseFloat(pt['@_lon']),
          ele: pt.ele !== undefined ? parseFloat(pt.ele) : NaN,
          time: pt.time ? Date.parse(pt.time) : NaN,
        })),
      ),
    )
    .filter((p) => isValidPoint([p.lat, p.lon]));

  const { distanceKm, heatmapData } = processPoints(validPoints.map((p) => [p.lat, p.lon]));
  const elevation = computeElevationStats(validPoints);
  const duration = computeDurationStats(validPoints);

  return { name, date, distanceKm, heatmapData, ...elevation, ...duration };
}

module.exports = { parseGpx };
