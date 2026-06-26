'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer, readItem } = require('../lib/db');
const { unauthorized } = require('../lib/http');

// GET /api/me — returns the caller's user doc, creating it on first login.
async function getMe(request, auth = authenticate, getContainer = usersContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const { userId, userEmail, userName } = user;
  const container = getContainer();

  let doc = await readItem(container, userId, userId);
  if (!doc) {
    doc = { id: userId, name: userName, email: userEmail, createdAt: new Date().toISOString() };
    ({ resource: doc } = await container.items.create(doc));
  } else if ((userName && userName !== doc.name) || (userEmail && userEmail !== doc.email)) {
    // Backfill/refresh profile fields once the token carries them (e.g. the
    // name claim that was absent on the very first login right after sign-up).
    doc.name = userName || doc.name;
    doc.email = userEmail || doc.email;
    ({ resource: doc } = await container.items.upsert(doc));
  }

  return {
    status: 200,
    jsonBody: { id: doc.id, name: doc.name, email: doc.email, createdAt: doc.createdAt },
  };
}

app.http('GetMe', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'me',
  handler: (request) => getMe(request),
});

module.exports = { getMe };
