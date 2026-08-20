'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const {
  usersContainer,
  toursContainer,
  deletionsContainer,
  readItem,
  queryUserItems,
} = require('../lib/db');
const { gpxContainer, imagesContainer } = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');

async function deleteBlobsByPrefix(container, prefix) {
  const names = [];
  for await (const blob of container.listBlobsFlat({ prefix })) {
    names.push(blob.name);
  }
  await Promise.all(names.map((name) => container.deleteBlob(name)));
}

// DELETE /api/account — tours, blobs and the user doc go now; the Entra identity
// is queued for out-of-band deletion, because the public API must never hold the
// privileged "delete any user" Graph credential (GDPR).
async function deleteAccount(
  request,
  auth = authenticate,
  getUsers = usersContainer,
  getTours = toursContainer,
  getGpx = gpxContainer,
  getImages = imagesContainer,
  getDeletions = deletionsContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();
  const { userId, userOid } = user;

  // Queued first, so the intent survives a later step failing. Only real Entra
  // users have an oid.
  if (userOid) {
    await getDeletions().items.upsert({ id: userOid, requestedAt: new Date().toISOString() });
  }

  const toursC = getTours();
  const tours = await queryUserItems(toursC, userId, 'SELECT c.id FROM c WHERE c.userId = @userId');
  await Promise.all(tours.map((tour) => toursC.item(tour.id, userId).delete()));

  // Blobs are namespaced under `${userId}/` in both containers.
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
  /* v8 ignore next */
  handler: (request) => deleteAccount(request),
});

module.exports = { deleteAccount };
