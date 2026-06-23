'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer } = require('../lib/db');
const { unauthorized } = require('../lib/http');

// GET /api/me — returns the caller's user doc, creating it on first login.
async function getMe(request, auth = authenticate, getContainer = usersContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const { userId, userEmail, userName } = user;
  const container = getContainer();

  // A missing item may throw 404 (real Cosmos) or resolve with resource
  // undefined (emulator); handle both.
  let doc;
  try {
    ({ resource: doc } = await container.item(userId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!doc) {
    doc = { id: userId, name: userName, email: userEmail, createdAt: new Date().toISOString() };
    ({ resource: doc } = await container.items.create(doc));
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
