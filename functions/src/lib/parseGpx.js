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

// Single pass: accumulate distance and downsample simultaneously.
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

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// fast-xml-parser yields a single object, an array, or undefined for a repeated
// element; normalise to an array.
const toArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * Parse a GPX string or Buffer and return tour metadata + heatmap points.
 * Handles multiple <trk> and <trkseg> elements; downsamples to ≤ 5,000 points.
 *
 * @param {string|Buffer} gpxInput
 * @returns {{ name: string|null, date: string|null, distanceKm: number, heatmapData: [number,number][] }}
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

  const allPoints = tracks.flatMap((trk) =>
    toArray(trk.trkseg).flatMap((seg) =>
      toArray(seg.trkpt).map((pt) => [parseFloat(pt['@_lat']), parseFloat(pt['@_lon'])]),
    ),
  );

  const { distanceKm, heatmapData } = processPoints(allPoints);
  return { name, date, distanceKm, heatmapData };
}

module.exports = { parseGpx };
