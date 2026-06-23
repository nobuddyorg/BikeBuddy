'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');

// GET /api/tours — list the authenticated user's tours, newest first.
// heatmapData is intentionally excluded to keep the list payload small; it is
// fetched per-tour by the detail endpoint.
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getContainer = toursContainer,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;

  const { resources } = await getContainer()
    .items.query(
      {
        query:
          'SELECT c.id, c.name, c.description, c.distance, c.createdAt ' +
          'FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@userId', value: userId }],
      },
      { partitionKey: userId },
    )
    .fetchAll();

  context.res = { status: 200, body: resources };
};
