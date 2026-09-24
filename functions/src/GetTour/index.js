'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, gpxContainer, readSasUrl } = require('../lib/blobStorage');
const { thumbBlobName } = require('../lib/thumbBlobName');
const { loadOwnedTour } = require('../lib/ownedTour');
const { toTourResponse } = require('../lib/tourResponse');

// RFC 8187 attr-char excludes ! ' ( ), which encodeURIComponent keeps.
function encodeFilenameExt(name) {
  return encodeURIComponent(name).replace(
    /[!'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Non-ASCII tour names are normal in the shipped locales, so the real name
// goes out as filename* (percent-encoded UTF-8) and the mangled ASCII form
// stays only as a fallback for clients that ignore filename*.
function gpxContentDisposition(name) {
  const safe = (name || 'tour').replace(/[\\/"']|[\p{Cc}\p{Cf}]/gu, '_');
  const fallback = safe.replace(/[^a-z0-9-_]+/gi, '_');
  return `attachment; filename="${fallback}.gpx"; filename*=UTF-8''${encodeFilenameExt(safe)}.gpx`;
}

// GET /api/tours/{tourId} — the full document, with every stored blobName
// swapped for a short-lived signed URL so the private container can be read
// directly by the browser.
async function getTour(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
  getGpxContainer = gpxContainer,
) {
  const guard = await loadOwnedTour(request, auth, getContainer);
  if (guard.response) return guard.response;
  const { tour } = guard;

  if (tour.images?.length) {
    const container = await getImagesContainer();
    tour.images = await Promise.all(
      tour.images.map(async (img) => {
        const [url, thumbUrl] = await Promise.all([
          readSasUrl(container.getBlockBlobClient(img.blobName)),
          readSasUrl(container.getBlockBlobClient(thumbBlobName(img.blobName))),
        ]);
        return {
          id: img.id,
          url,
          thumbUrl,
          ...(typeof img.lat === 'number' && { lat: img.lat, lon: img.lon }),
        };
      }),
    );
  } else {
    tour.images = [];
  }

  if (tour.gpxFileUrl) {
    const container = await getGpxContainer();
    tour.gpxFileUrl = await readSasUrl(
      container.getBlockBlobClient(`${tour.userId}/${tour.id}.gpx`),
      {
        contentDisposition: gpxContentDisposition(tour.name),
      },
    );
  }

  return { status: 200, jsonBody: toTourResponse(tour) };
}

app.http('GetTour', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => getTour(request),
});

module.exports = { getTour };
