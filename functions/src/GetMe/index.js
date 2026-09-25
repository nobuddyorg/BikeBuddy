'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const system = require('../lib/system');
const { unauthorized } = require('../lib/http');
const {
  profileFromClaims,
  missingProfileFields,
  newUserDocument,
  toUserResponse,
} = require('../lib/userProfile');

// Concurrent first requests race to create the profile; both end with the winner's.
async function readOrCreateProfile({ container, userId, claims, now }) {
  const stored = await db.readItem(container, { id: userId, partitionKey: userId });
  if (stored) return stored;
  return db.createItemOrReadExisting(container, {
    document: newUserDocument({ userId, profile: claims, createdAt: now() }),
    partitionKey: userId,
  });
}

// Fills empty fields only if unchanged since read: a name chosen meanwhile wins.
async function backfillProfile({ container, userId, stored, claims }) {
  const missing = missingProfileFields({ stored, claims });
  if (Object.keys(missing).length === 0) return stored;
  try {
    return await db.replaceItemIfMatch(container, {
      document: { ...stored, ...missing },
      partitionKey: userId,
      etag: stored._etag,
    });
  } catch (replaceError) {
    if (replaceError.code !== 412) throw replaceError;
    return (await db.readItem(container, { id: userId, partitionKey: userId })) ?? stored;
  }
}

// Token claims only fill empty fields: a name or email the user chose is never overwritten.
async function getMe(
  request,
  {
    authenticate = authMiddleware.authenticate,
    usersContainer = db.usersContainer,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();

  const { userId } = user;
  const container = usersContainer();
  const claims = profileFromClaims(user);
  const stored = await readOrCreateProfile({ container, userId, claims, now });
  const profile = await backfillProfile({ container, userId, stored, claims });

  return { status: 200, jsonBody: toUserResponse(profile) };
}

app.http('GetMe', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'me',
  /* v8 ignore next */
  handler: withFailureResponse((request) => getMe(request)),
});

module.exports = { getMe };
