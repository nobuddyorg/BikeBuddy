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
function toTourResponse(tour) {
  return {
    id: tour.id,
    name: tourName(tour.name),
    description: tour.description,
    distance: tour.distance,
    createdAt: tour.createdAt,
    heatmapData: tour.heatmapData ?? [],
    ...Object.fromEntries(STAT_FIELDS.map((field) => [field, tour[field] ?? null])),
  };
}

/**
 * @param {{ tour: object, images: object[], gpxFileUrl?: string }} detail signed URLs only
 */
function toTourDetailResponse({ tour, images, gpxFileUrl }) {
  return { ...toTourResponse(tour), images, ...(gpxFileUrl && { gpxFileUrl }) };
}

// The frontend reads `tourId` from the upload response.
const toCreatedTourResponse = (tour) => ({
  tourId: tour.id,
  name: tour.name,
  distance: tour.distance,
  createdAt: tour.createdAt,
});

function gpxDownloadDisposition(name) {
  const filename = `${tourName(name, 'tour').replace(/[^a-z0-9-_]+/gi, '_')}.gpx`;
  return `attachment; filename="${filename}"`;
}

module.exports = {
  tourName,
  toTourResponse,
  toTourDetailResponse,
  toCreatedTourResponse,
  gpxDownloadDisposition,
};
