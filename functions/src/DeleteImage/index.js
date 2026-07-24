'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { imagesContainer } = require('../lib/blobStorage');
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

  const container = await getImagesContainer();
  await container.getBlockBlobClient(image.blobName).deleteIfExists();

  // .replace(tour) overwrites the whole document, so a concurrent request
  // that read the tour before this one's write lands would otherwise clobber
  // it (or vice versa) — e.g. deleting two photos from the same tour close
  // together. Guard the write with the ETag read alongside tour and retry
  // against a fresh read on conflict (#292-adjacent race, same class as the
  // UploadImage one).
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
