'use strict';

const { apiRoute } = require('../lib/functionsApp');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const { ERROR_KEYS, error, unauthorized } = require('../lib/http');
const { toTourSummaryResponse } = require('../lib/tourResponse');
const { pageRequest, pageBody } = require('../lib/paging');

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
  const page = pageRequest(request.query);
  if (page.kind === 'invalid') return error(400, ERROR_KEYS.pageInvalid);
  const listQuery = { userId: user.userId, query: LIST_QUERY };

  if (page.kind === 'all') {
    const tours = await db.queryUserItems(toursContainer(), listQuery);
    return { status: 200, jsonBody: tours.map(toTourSummaryResponse) };
  }
  const { items, more } = await db.queryUserPage(toursContainer(), {
    ...listQuery,
    offset: page.offset,
    limit: page.limit,
  });
  return {
    status: 200,
    jsonBody: pageBody({ items: items.map(toTourSummaryResponse), page, more }),
  };
}

apiRoute('GetTours', {
  methods: ['get'],
  route: 'tours',
  /* v8 ignore next */
  handler: (request) => getTours(request),
});

module.exports = { getTours };
