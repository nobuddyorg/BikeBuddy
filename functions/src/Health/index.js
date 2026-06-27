'use strict';

const { app } = require('@azure/functions');

// GET /api/health — public, unauthenticated liveness probe for uptime checks
// and CI readiness. Intentionally does no I/O so it stays fast and can't be
// turned into an unauthenticated way to probe backing services.
async function health() {
  return { status: 200, jsonBody: { status: 'ok' } };
}

app.http('Health', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'health',
  handler: () => health(),
});

module.exports = { health };
