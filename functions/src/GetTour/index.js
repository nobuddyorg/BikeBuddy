'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, gpxContainer, readSasUrl } = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');
const { toTourResponse } = require('../lib/tourResponse');

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
    const filename = `${(tour.name || 'tour').replace(/[^a-z0-9-_]+/gi, '_')}.gpx`;
    tour.gpxFileUrl = await readSasUrl(
      container.getBlockBlobClient(`${tour.userId}/${tour.id}.gpx`),
      {
        contentDisposition: `attachment; filename="${filename}"`,
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
