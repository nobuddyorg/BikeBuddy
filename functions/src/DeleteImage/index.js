'use strict';

const { app } = require('@azure/functions');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');
const { imageBlobName, thumbnailBlobName } = require('../lib/blobNames');
const { settleAll } = require('../lib/settle');
const { error } = require('../lib/http');

const MAX_REPLACE_ATTEMPTS = 3;

const withoutImage = (tour, imageId) => tour.images.filter((image) => image.id !== imageId);

// Conditional on the ETag and retried on a fresh read; false once the tour itself is gone.
async function removeImageEntry({ container, tour, imageId, userId }) {
  let current = tour;
  for (let attempt = 1; ; attempt++) {
    try {
      await db.replaceItemIfMatch(container, {
        document: { ...current, images: withoutImage(current, imageId) },
        partitionKey: userId,
        etag: current._etag,
      });
      return true;
    } catch (replaceError) {
      if (replaceError.code !== 412 || attempt >= MAX_REPLACE_ATTEMPTS) throw replaceError;
      current = await db.readItem(container, { id: tour.id, partitionKey: userId });
      if (!current) return false;
    }
  }
}

// Entry before blobs: a failure in between leaves an unreferenced blob, not a dead entry.
async function deleteImage(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    imagesContainer = blobStorage.imagesContainer,
  } = {},
) {
  const { imageId } = request.params;
  const guard = await loadOwnedTour(request, {
    authenticate,
    toursContainer,
    otherIdParams: { imageId },
  });
  if (guard.response) return guard.response;
  const { tour } = guard;
  const { userId } = guard.user;

  if (!tour.images?.some((image) => image.id === imageId)) {
    return error(404, 'Image not found');
  }
  const removed = await removeImageEntry({ container: toursContainer(), tour, imageId, userId });
  if (!removed) return error(404, 'Tour not found');

  const blobName = imageBlobName({ userId, tourId: tour.id, imageId });
  const container = await imagesContainer();
  await settleAll(
    [
      blobStorage.deleteBlobIfExists(container, blobName),
      blobStorage.deleteBlobIfExists(container, thumbnailBlobName(blobName)),
    ],
    `Image ${imageId} was removed from its tour, but not all of its blobs were deleted`,
  );
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
