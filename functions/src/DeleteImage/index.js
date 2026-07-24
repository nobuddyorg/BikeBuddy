'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer } = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');
const { error } = require('../lib/http');

// DELETE /api/tours/{tourId}/images/{imageId} — remove an image blob and its
// entry from tour.images.
async function deleteImage(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
) {
  const { tourId, imageId } = request.params;
  const guard = await loadOwnedTour(request, auth, getToursContainer, { imageId });
  if (guard.response) return guard.response;

  const { userId } = guard.user;
  const { tour } = guard;

  const image = (tour.images || []).find((i) => i.id === imageId);
  if (!image) return error(404, 'Image not found');

  const container = await getImagesContainer();
  await container.getBlockBlobClient(image.blobName).deleteIfExists();

  tour.images = tour.images.filter((i) => i.id !== imageId);
  await getToursContainer().item(tourId, userId).replace(tour);

  return { status: 204 };
}

app.http('DeleteImage', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}/images/{imageId}',
  /* v8 ignore next */
  handler: (request) => deleteImage(request),
});

module.exports = { deleteImage };
