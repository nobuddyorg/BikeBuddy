'use strict';

const { app } = require('@azure/functions');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { userBlobPrefix } = require('../lib/blobNames');
const { settleAll } = require('../lib/settle');
const { unauthorized } = require('../lib/http');

const OWN_TOUR_IDS_QUERY = 'SELECT c.id FROM c WHERE c.userId = @userId';

async function deleteDocuments({ userId, toursContainer, usersContainer }) {
  const tours = toursContainer();
  const ownTours = await db.queryUserItems(tours, { userId, query: OWN_TOUR_IDS_QUERY });
  await settleAll(
    [
      ...ownTours.map((tour) =>
        db.deleteItemIfExists(tours, { id: tour.id, partitionKey: userId }),
      ),
      db.deleteItemIfExists(usersContainer(), { id: userId, partitionKey: userId }),
    ],
    'Some documents of the account were not deleted',
  );
}

async function deleteBlobs({ userId, gpxContainer, imagesContainer }) {
  const prefix = userBlobPrefix(userId);
  const [gpx, images] = await Promise.all([gpxContainer(), imagesContainer()]);
  await settleAll(
    [blobStorage.deleteBlobsByPrefix(gpx, prefix), blobStorage.deleteBlobsByPrefix(images, prefix)],
    'The documents of the account are gone, but some of its blobs were not deleted',
  );
}

// Documents before blobs, each step idempotent, so a retry after a failure finishes the job.
async function deleteAccount(
  request,
  {
    authenticate = authMiddleware.authenticate,
    usersContainer = db.usersContainer,
    toursContainer = db.toursContainer,
    deletionsContainer = db.deletionsContainer,
    gpxContainer = blobStorage.gpxContainer,
    imagesContainer = blobStorage.imagesContainer,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const { userId, userOid } = user;

  // Queued first to survive a later failure; only a real Entra user has an oid.
  if (userOid) {
    await db.upsertItem(deletionsContainer(), { id: userOid, requestedAt: now().toISOString() });
  }
  await deleteDocuments({ userId, toursContainer, usersContainer });
  await deleteBlobs({ userId, gpxContainer, imagesContainer });

  return { status: 204 };
}

app.http('DeleteAccount', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'account',
  /* v8 ignore next */
  handler: (request) => deleteAccount(request),
});

module.exports = { deleteAccount };
