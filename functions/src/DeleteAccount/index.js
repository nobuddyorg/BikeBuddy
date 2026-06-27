'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer, toursContainer, readItem } = require('../lib/db');
const { gpxContainer, imagesContainer } = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');

async function deleteBlobsByPrefix(container, prefix) {
  for await (const blob of container.listBlobsFlat({ prefix })) {
    await container.deleteBlob(blob.name);
  }
}

// DELETE /api/account — permanently delete the caller's account and all their
// data: tours (Cosmos), GPX + image blobs (userId prefix), and the user doc.
async function deleteAccount(
  request,
  auth = authenticate,
  getUsers = usersContainer,
  getTours = toursContainer,
  getGpx = gpxContainer,
  getImages = imagesContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();
  const { userId } = user;

  // Tours live in the user's partition — delete each.
  const toursC = getTours();
  const { resources: tours } = await toursC.items
    .query(
      {
        query: 'SELECT c.id FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      },
      { partitionKey: userId },
    )
    .fetchAll();
  for (const tour of tours) {
    await toursC.item(tour.id, userId).delete();
  }

  // All blobs are namespaced under `${userId}/` in both containers.
  const prefix = `${userId}/`;
  await deleteBlobsByPrefix(await getGpx(), prefix);
  await deleteBlobsByPrefix(await getImages(), prefix);

  const userDoc = await readItem(getUsers(), userId, userId);
  if (userDoc) await getUsers().item(userId, userId).delete();

  return { status: 204 };
}

app.http('DeleteAccount', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'account',
  handler: (request) => deleteAccount(request),
});

module.exports = { deleteAccount };
