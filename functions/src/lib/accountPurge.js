// @ts-check
'use strict';

const db = require('./db');
const blobStorage = require('./blobStorage');
const { userBlobPrefix } = require('./blobNames');
const { settleAll, settleAllLimited } = require('./settle');

const OWN_TOUR_IDS_QUERY = 'SELECT c.id FROM c WHERE c.userId = @userId';
const DELETE_CONCURRENCY = 10;

async function deleteDocuments({ userId, toursContainer, usersContainer }) {
  const tours = toursContainer();
  const ownTours = await db.queryUserItems(tours, { userId, query: OWN_TOUR_IDS_QUERY });
  await settleAllLimited(
    [
      ...ownTours.map(
        (tour) => () => db.deleteItemIfExists(tours, { id: tour.id, partitionKey: userId }),
      ),
      () => db.deleteItemIfExists(usersContainer(), { id: userId, partitionKey: userId }),
    ],
    { limit: DELETE_CONCURRENCY, failureMessage: 'Some documents of the account were not deleted' },
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

/**
 * Every document and blob of one app user, documents first; each step is idempotent, so a retry,
 * from DeleteAccount or the deletion job, finishes whatever a failure left.
 *
 * @param {{ userId: string, toursContainer: () => any, usersContainer: () => any,
 *   gpxContainer: () => Promise<any>, imagesContainer: () => Promise<any> }} account
 */
async function purgeAccountData({
  userId,
  toursContainer,
  usersContainer,
  gpxContainer,
  imagesContainer,
}) {
  await deleteDocuments({ userId, toursContainer, usersContainer });
  await deleteBlobs({ userId, gpxContainer, imagesContainer });
}

module.exports = { purgeAccountData };
