'use strict';

const { app } = require('../lib/functionsApp');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const system = require('../lib/system');
const { toExportDocument } = require('../lib/exportDocument');
const { unauthorized } = require('../lib/http');

const ALL_OWN_TOURS_QUERY = 'SELECT * FROM c WHERE c.userId = @userId';

// GDPR data portability: every document of the caller, as stored.
async function exportData(
  request,
  {
    authenticate = authMiddleware.authenticate,
    usersContainer = db.usersContainer,
    toursContainer = db.toursContainer,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const { userId } = user;

  const [profile, tours] = await Promise.all([
    db.readItem(usersContainer(), { id: userId, partitionKey: userId }),
    db.queryUserItems(toursContainer(), { userId, query: ALL_OWN_TOURS_QUERY }),
  ]);

  return {
    status: 200,
    headers: { 'Content-Disposition': 'attachment; filename="bikebuddy-export.json"' },
    jsonBody: {
      exportedAt: now().toISOString(),
      user: profile ? toExportDocument(profile) : null,
      tours: tours.map(toExportDocument),
    },
  };
}

app.http('ExportData', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'me/export',
  /* v8 ignore next */
  handler: (request) => exportData(request),
});

module.exports = { exportData };
