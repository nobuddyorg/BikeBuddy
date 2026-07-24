'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { gpxContainer } = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');

// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob.
async function deleteTour(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getGpxContainer = gpxContainer,
) {
  const guard = await loadOwnedTour(request, auth, getToursContainer);
  if (guard.response) return guard.response;

  const { userId } = guard.user;
  const { tourId } = request.params;

  const container = await getGpxContainer();
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
  await getToursContainer().item(tourId, userId).delete();

  return { status: 204 };
}

app.http('DeleteTour', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => deleteTour(request),
});

module.exports = { deleteTour };
