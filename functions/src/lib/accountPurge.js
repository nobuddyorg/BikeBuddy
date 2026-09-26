// @ts-check
'use strict';

const db = require('./db');
const blobStorage = require('./blobStorage');
const { userBlobPrefix } = require('./blobNames');
const { settleAll, settleAllLimited } = require('./settle');

const OWN_IDS_QUERY = 'SELECT c.id FROM c WHERE c.userId = @userId';
const DELETE_CONCURRENCY = 10;

// Tracks are listed on their own: one left behind by a failed delete has no tour to find it by.
async function deleteDocuments({ userId, toursContainer, tracksContainer, usersContainer }) {
  const [tours, tracks] = [toursContainer(), tracksContainer()];
  const [ownTours, ownTracks] = await Promise.all(
    [tours, tracks].map((container) =>
      db.queryUserItems(container, { userId, query: OWN_IDS_QUERY }),
    ),
  );
  const deleteFrom = (container) => (item) => () =>
    db.deleteItemIfExists(container, { id: item.id, partitionKey: userId });
  await settleAllLimited(
    [
      ...ownTours.map(deleteFrom(tours)),
      ...ownTracks.map(deleteFrom(tracks)),
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
 * @param {{ userId: string, toursContainer: () => any, tracksContainer: () => any,
 *   usersContainer: () => any,
 *   gpxContainer: () => Promise<any>, imagesContainer: () => Promise<any> }} account
 */
async function purgeAccountData({
  userId,
  toursContainer,
  tracksContainer,
  usersContainer,
  gpxContainer,
  imagesContainer,
}) {
  await deleteDocuments({ userId, toursContainer, tracksContainer, usersContainer });
  await deleteBlobs({ userId, gpxContainer, imagesContainer });
}

module.exports = { purgeAccountData };
