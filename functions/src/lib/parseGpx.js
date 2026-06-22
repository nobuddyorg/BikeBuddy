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

function totalDistanceKm(points) {
  let dist = 0;
  for (let i = 1; i < points.length; i++) dist += haversineKm(points[i - 1], points[i]);
  return dist;
}

// Take every Nth point so the result has at most MAX_POINTS entries, always
// keeping the first and last point.
function downsample(points) {
  if (points.length <= MAX_POINTS) return points;
  const step = Math.ceil(points.length / MAX_POINTS);
  const result = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/**
 * Parse a GPX string and return tour metadata + heatmap points.
 *
 * @param {string} gpxString  Raw GPX XML
 * @returns {{ name: string|null, date: string|null, distanceKm: number, heatmapData: [number,number][] }}
 */
function parseGpx(gpxString) {
  const doc = parser.parse(gpxString);
  const gpx = doc?.gpx;
  if (!gpx) throw new Error('Not a valid GPX file');

  const name = gpx.metadata?.name || gpx.trk?.name || null;
  const time = gpx.metadata?.time || gpx.trk?.trkseg?.trkpt?.[0]?.time || null;
  const date = time ? new Date(time).toISOString() : null;

  // Normalise trkpt: may be a single object or an array.
  const rawPts = gpx.trk?.trkseg?.trkpt;
  const trkpts = Array.isArray(rawPts) ? rawPts : rawPts ? [rawPts] : [];

  const allPoints = trkpts.map((pt) => [parseFloat(pt['@_lat']), parseFloat(pt['@_lon'])]);

  const distanceKm = totalDistanceKm(allPoints);
  const heatmapData = downsample(allPoints);

  return { name, date, distanceKm, heatmapData };
}

module.exports = { parseGpx };
