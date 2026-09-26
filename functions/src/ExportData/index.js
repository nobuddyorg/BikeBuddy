'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { gpxBlobName, imageBlobName } = require('../lib/blobNames');
const { toExportDocument, toExportTour } = require('../lib/exportDocument');
const { gpxDownloadDisposition } = require('../lib/tourResponse');
const { unauthorized } = require('../lib/http');
const { readTracksByTour } = require('../lib/tourTrack');

const ALL_OWN_TOURS_QUERY = 'SELECT * FROM c WHERE c.userId = @userId';

// Blob names from the token's user id, never a stored one; tours seeded without an upload have no GPX.
async function withSignedLinks(tour, { userId, signGpx, signImage }) {
  const tourId = tour.id;
  const [gpxFileUrl, imageUrls] = await Promise.all([
    tour.gpxFileUrl
      ? signGpx(gpxBlobName({ userId, tourId }), {
          contentDisposition: gpxDownloadDisposition(tour.name),
        })
      : undefined,
    Promise.all(
      (tour.images ?? []).map((image) =>
        signImage(imageBlobName({ userId, tourId, imageId: image.id })),
      ),
    ),
  ]);
  return toExportTour(tour, { gpxFileUrl, imageUrls });
}

// GDPR data portability: every document of the caller, with short-lived links to their files.
async function exportData(
  request,
  {
    authenticate = authMiddleware.authenticate,
    usersContainer = db.usersContainer,
    toursContainer = db.toursContainer,
    tracksContainer = db.tracksContainer,
    gpxContainer = blobStorage.gpxContainer,
    imagesContainer = blobStorage.imagesContainer,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const { userId } = user;
  const requestTime = now();

  const [profile, storedTours, tracksByTour] = await Promise.all([
    db.readItem(usersContainer(), { id: userId, partitionKey: userId }),
    db.queryUserItems(toursContainer(), { userId, query: ALL_OWN_TOURS_QUERY }),
    readTracksByTour({ userId, toursContainer, tracksContainer }),
  ]);
  // The export keeps one document per tour: its track goes back in, wherever it is stored.
  const tours = storedTours.map((tour) => ({
    ...tour,
    ...(tracksByTour.get(tour.id) ?? { heatmapData: [], segmentStarts: [] }),
  }));
  const signers = {
    userId,
    signGpx: blobStorage.readUrlSigner({ container: gpxContainer, now: requestTime }),
    signImage: blobStorage.readUrlSigner({ container: imagesContainer, now: requestTime }),
  };

  return {
    status: 200,
    headers: { 'Content-Disposition': 'attachment; filename="bikebuddy-export.json"' },
    jsonBody: {
      exportedAt: requestTime.toISOString(),
      linksExpireAt: blobStorage.sasExpiresOn(requestTime).toISOString(),
      user: profile ? toExportDocument(profile) : null,
      tours: await Promise.all(tours.map((tour) => withSignedLinks(tour, signers))),
    },
  };
}

app.http('ExportData', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'me/export',
  /* v8 ignore next */
  handler: withFailureResponse((request) => exportData(request)),
});

module.exports = { exportData };
