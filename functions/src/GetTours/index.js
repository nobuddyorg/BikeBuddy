'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, queryUserItems } = require('../lib/db');
const { unauthorized } = require('../lib/http');

// GET /api/tours — newest first, without heatmapData: the detail endpoint
// fetches that per tour, so the list payload stays small.
async function getTours(request, auth = authenticate, getContainer = toursContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const resources = await queryUserItems(
    getContainer(),
    user.userId,
    'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
      'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
  );

  return { status: 200, jsonBody: resources };
}

app.http('GetTours', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours',
  /* v8 ignore next */
  handler: (request) => getTours(request),
});

module.exports = { getTours };
