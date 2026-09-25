'use strict';

const { app } = require('@azure/functions');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { loadOwnedTour } = require('../lib/ownedTour');
const { gpxBlobName } = require('../lib/blobNames');
const { toSignedImage } = require('../lib/tourImages');
const { toTourDetailResponse, gpxDownloadDisposition } = require('../lib/tourResponse');

// Tours seeded without an upload have no GPX blob, and so nothing to download.
async function signedGpxDownload({ tour, userId, gpxContainer, now }) {
  if (!tour.gpxFileUrl) return {};
  const gpxFileUrl = await blobStorage.readSasUrl(await gpxContainer(), {
    blobName: gpxBlobName({ userId, tourId: tour.id }),
    now,
    contentDisposition: gpxDownloadDisposition(tour.name),
  });
  return { gpxFileUrl };
}

async function getTour(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    imagesContainer = blobStorage.imagesContainer,
    gpxContainer = blobStorage.gpxContainer,
    now = system.currentTime,
  } = {},
) {
  const guard = await loadOwnedTour(request, { authenticate, toursContainer });
  if (guard.response) return guard.response;
  const { tour } = guard;
  const { userId } = guard.user;
  const requestTime = now();

  const signUrl = blobStorage.readUrlSigner({ container: imagesContainer, now: requestTime });
  const [images, download] = await Promise.all([
    Promise.all(
      (tour.images ?? []).map((image) =>
        toSignedImage(image, { userId, tourId: tour.id, signUrl }),
      ),
    ),
    signedGpxDownload({ tour, userId, gpxContainer, now: requestTime }),
  ]);

  return { status: 200, jsonBody: toTourDetailResponse({ tour, images, ...download }) };
}

app.http('GetTour', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => getTour(request),
});

module.exports = { getTour };
