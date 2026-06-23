'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { unauthorized } = require('../lib/http');

// GET /api/tours — list the authenticated user's tours, newest first.
// heatmapData is intentionally excluded to keep the list payload small; it is
// fetched per-tour by the detail endpoint.
async function getTours(request, auth = authenticate, getContainer = toursContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const { resources } = await getContainer()
    .items.query(
      {
        query:
          'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
          'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@userId', value: user.userId }],
      },
      { partitionKey: user.userId },
    )
    .fetchAll();

  return { status: 200, jsonBody: resources };
}

app.http('GetTours', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours',
  handler: (request) => getTours(request),
});

module.exports = { getTours };
