// @ts-check
'use strict';

// Absent on documents written before the stats existed; the client gets null.
const STAT_FIELDS = [
  'elevationGain',
  'elevationLoss',
  'minElevation',
  'maxElevation',
  'durationSeconds',
  'movingSeconds',
  'avgSpeed',
];

// Uploads before GPX names were validated could store a number or an object.
function tourName(name, fallback = 'Untitled Tour') {
  if (typeof name === 'string') return name || fallback;
  if (typeof name === 'number') return String(name);
  return fallback;
}

// A projection, never a copy: system properties, userId and blob names stay server-side.
function toTourResponse(tour, heatmapData) {
  return {
    id: tour.id,
    name: tourName(tour.name),
    description: tour.description,
    distance: tour.distance,
    createdAt: tour.createdAt,
    heatmapData,
    ...Object.fromEntries(STAT_FIELDS.map((field) => [field, tour[field] ?? null])),
  };
}

// What the list and an edit answer: no track, so neither payload grows with the ride.
function toTourSummaryResponse(tour) {
  return {
    id: tour.id,
    name: tourName(tour.name),
    description: tour.description,
    distance: tour.distance,
    createdAt: tour.createdAt,
  };
}

/**
 * @param {{ tour: object, heatmapData: [number, number][], images: object[], gpxFileUrl?: string }}
 *   detail the track read apart from the tour (#615), and signed URLs only
 */
function toTourDetailResponse({ tour, heatmapData, images, gpxFileUrl }) {
  return { ...toTourResponse(tour, heatmapData), images, ...(gpxFileUrl && { gpxFileUrl }) };
}

// The frontend reads `tourId` from the upload response.
const toCreatedTourResponse = (tour) => ({
  tourId: tour.id,
  name: tour.name,
  distance: tour.distance,
  createdAt: tour.createdAt,
});

const withoutAccents = (text) => text.normalize('NFKD').replace(/\p{M}+/gu, '');

// RFC 6266: an ASCII `filename` for old clients, and `filename*` keeps any other letter.
function gpxDownloadDisposition(name) {
  const unicodeBase = tourName(name, 'tour').replace(/[^\p{L}\p{N}_-]+/gu, '_');
  const transliterated = withoutAccents(unicodeBase).replace(/[^a-z0-9_-]+/gi, '_');
  const asciiBase = /[a-z0-9]/i.test(transliterated) ? transliterated : 'tour';
  const disposition = `attachment; filename="${asciiBase}.gpx"`;
  if (asciiBase === unicodeBase) return disposition;
  const encodedFilename = encodeURIComponent(`${unicodeBase}.gpx`);
  return `${disposition}; filename*=UTF-8''${encodedFilename}`;
}

module.exports = {
  toTourResponse,
  toTourSummaryResponse,
  toTourDetailResponse,
  toCreatedTourResponse,
  gpxDownloadDisposition,
};
