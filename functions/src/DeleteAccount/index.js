'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { purgeAccountData } = require('../lib/accountPurge');
const { unauthorized } = require('../lib/http');

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

  // Queued first to survive a later failure; the job purges userId again before the identity goes.
  if (userOid) {
    await db.upsertItem(deletionsContainer(), {
      id: userOid,
      userId,
      requestedAt: now().toISOString(),
    });
  }
  await purgeAccountData({ userId, toursContainer, usersContainer, gpxContainer, imagesContainer });

  return { status: 204 };
}

app.http('DeleteAccount', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'account',
  /* v8 ignore next */
  handler: withFailureResponse((request) => deleteAccount(request)),
});

module.exports = { deleteAccount };
