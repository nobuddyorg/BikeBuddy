'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, gpxContainer, readSasUrl } = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');

// GET /api/tours/{tourId} — full tour document including heatmapData. Stored
// images { id, blobName } are returned as { id, url } with a short-lived read
// SAS URL so the private container can be served directly. gpxFileUrl (a bare
// blob URL, not directly downloadable) is likewise replaced with a signed URL.
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
      tour.images.map(async (img) => ({
        id: img.id,
        url: await readSasUrl(container.getBlockBlobClient(img.blobName)),
        ...(typeof img.lat === 'number' && { lat: img.lat, lon: img.lon }),
      })),
    );
  } else {
    tour.images = [];
  }

  if (tour.gpxFileUrl) {
    const container = await getGpxContainer();
    tour.gpxFileUrl = await readSasUrl(
      container.getBlockBlobClient(`${tour.userId}/${tour.id}.gpx`),
    );
  }

  return { status: 200, jsonBody: tour };
}

app.http('GetTour', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => getTour(request),
});

module.exports = { getTour };
