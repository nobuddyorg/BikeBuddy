'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { imagesContainer } = require('../lib/blobStorage');
const { uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// DELETE /api/tours/{tourId}/images/{imageId} — remove an image blob and its
// entry from tour.images. Ownership via the userId partition key.
async function deleteImage(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const { tourId, imageId } = request.params;
  const badParam = uuidParamError({ tourId, imageId });
  if (badParam) return badParam;

  const { userId } = user;

  const tour = await readItem(getToursContainer(), tourId, userId);
  if (!tour) return error(404, 'Tour not found');

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
  handler: (request) => deleteImage(request),
});

module.exports = { deleteImage };
