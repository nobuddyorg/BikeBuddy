'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { imagesContainer } = require('../lib/blobStorage');
const { thumbBlobName } = require('../lib/thumbBlobName');
const { loadOwnedTour } = require('../lib/ownedTour');
const { error } = require('../lib/http');

const MAX_REPLACE_ATTEMPTS = 3;

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
  let tour = guard.tour;

  const image = (tour.images || []).find((i) => i.id === imageId);
  if (!image) return error(404, 'Image not found');

  // Entry first, blob second. The leftover from failing here is an orphaned
  // blob: invisible, cheap, and reaped wholesale by DeleteAccount. The reverse
  // order leaves tour.images pointing at nothing — a broken thumbnail a retry
  // can't fix, because it finds the entry still present.
  //
  // .replace(tour) rewrites the whole document, so two photo deletions close
  // together would clobber each other. The ETag read alongside the tour guards
  // the write, and a conflict retries against a fresh read.
  for (let attempt = 0; ; attempt++) {
    const images = tour.images.filter((i) => i.id !== imageId);
    try {
      await getToursContainer()
        .item(tourId, userId)
        .replace(
          { ...tour, images },
          { accessCondition: { type: 'IfMatch', condition: tour._etag } },
        );
      break;
    } catch (err) {
      if (err.code !== 412 || attempt >= MAX_REPLACE_ATTEMPTS - 1) throw err;
      tour = await readItem(getToursContainer(), tourId, userId);
    }
  }

  const container = await getImagesContainer();
  await Promise.all([
    container.getBlockBlobClient(image.blobName).deleteIfExists(),
    container.getBlockBlobClient(thumbBlobName(image.blobName)).deleteIfExists(),
  ]);

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
