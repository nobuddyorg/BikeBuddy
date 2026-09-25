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

function safeDownloadName(name) {
  return [...tourName(name, 'tour')]
    .map((character) => {
      const codePoint = /** @type {number} */ (character.codePointAt(0));
      return character === '/' ||
        character === '\\' ||
        character === '"' ||
        codePoint < 0x20 ||
        codePoint === 0x7f
        ? '_'
        : character;
    })
    .join('');
}

function gpxDownloadDisposition(name) {
  const safeName = safeDownloadName(name);
  const filename = `${safeName}.gpx`;
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_');
  const utf8Filename = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Filename}`;
}

module.exports = {
  tourName,
  toTourResponse,
  toTourDetailResponse,
  toCreatedTourResponse,
  gpxDownloadDisposition,
};
