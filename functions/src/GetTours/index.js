'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const { unauthorized } = require('../lib/http');
const { tourName } = require('../lib/tourResponse');

// The list projection: heatmapData stays out of list responses.
const LIST_QUERY =
  'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
  'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC';

async function getTours(
  request,
  { authenticate = authMiddleware.authenticate, toursContainer = db.toursContainer } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();

  const tours = await db.queryUserItems(toursContainer(), {
    userId: user.userId,
    query: LIST_QUERY,
  });
  return { status: 200, jsonBody: tours.map((tour) => ({ ...tour, name: tourName(tour.name) })) };
}

app.http('GetTours', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours',
  /* v8 ignore next */
  handler: withFailureResponse((request) => getTours(request)),
});

module.exports = { getTours };
