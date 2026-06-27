'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { usersContainer, toursContainer, readItem } = require('../lib/db');
const { unauthorized } = require('../lib/http');

// GET /api/me/export — the caller's full data (user doc + all their tours) as a
// downloadable JSON file (GDPR data portability).
async function exportData(
  request,
  auth = authenticate,
  getUsers = usersContainer,
  getTours = toursContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();
  const { userId } = user;

  const userDoc = await readItem(getUsers(), userId, userId);
  const { resources: tours } = await getTours()
    .items.query(
      {
        query: 'SELECT * FROM c WHERE c.userId = @userId',
        parameters: [{ name: '@userId', value: userId }],
      },
      { partitionKey: userId },
    )
    .fetchAll();

  return {
    status: 200,
    headers: { 'Content-Disposition': 'attachment; filename="bikebuddy-export.json"' },
    jsonBody: { exportedAt: new Date().toISOString(), user: userDoc ?? null, tours },
  };
}

app.http('ExportData', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'me/export',
  handler: (request) => exportData(request),
});

module.exports = { exportData };
