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
