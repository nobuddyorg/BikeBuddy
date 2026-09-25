'use strict';

const { app } = require('@azure/functions');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const { loadOwnedTour } = require('../lib/ownedTour');
const { gpxBlobName } = require('../lib/blobNames');
const { imageBlobNames } = require('../lib/tourImages');
const { settleAll } = require('../lib/settle');

// Document first: a failure after it leaves unreferenced blobs, never a tour missing files.
async function deleteTour(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    gpxContainer = blobStorage.gpxContainer,
    imagesContainer = blobStorage.imagesContainer,
  } = {},
) {
  const guard = await loadOwnedTour(request, { authenticate, toursContainer });
  if (guard.response) return guard.response;
  const { tour } = guard;
  const { userId } = guard.user;

  await db.deleteItem(toursContainer(), { id: tour.id, partitionKey: userId });

  const [gpx, images] = await Promise.all([gpxContainer(), imagesContainer()]);
  await settleAll(
    [
      blobStorage.deleteBlobIfExists(gpx, gpxBlobName({ userId, tourId: tour.id })),
      ...imageBlobNames({ userId, tour }).map((name) =>
        blobStorage.deleteBlobIfExists(images, name),
      ),
    ],
    `Tour ${tour.id} was deleted, but some of its blobs were not`,
  );

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
