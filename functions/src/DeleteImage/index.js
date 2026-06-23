'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer } = require('../lib/blobStorage');

// DELETE /api/tours/{tourId}/images/{imageId} — remove an image blob and its
// entry from tour.images. Ownership via the userId partition key (other user's
// tour isn't found → 404).
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;
  const { tourId, imageId } = req.params ?? {};

  let tour;
  try {
    ({ resource: tour } = await getToursContainer().item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) {
    context.res = { status: 404, body: { error: 'Tour not found' } };
    return;
  }

  const image = (tour.images || []).find((i) => i.id === imageId);
  if (!image) {
    context.res = { status: 404, body: { error: 'Image not found' } };
    return;
  }

  const container = await getImagesContainer();
  await container.getBlockBlobClient(image.blobName).deleteIfExists();

  tour.images = tour.images.filter((i) => i.id !== imageId);
  await getToursContainer().item(tourId, userId).replace(tour);

  context.res = { status: 204 };
};
