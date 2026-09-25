'use strict';

const { app } = require('@azure/functions');

// Public liveness probe. No I/O, so it cannot be used to probe the backing services.
async function health() {
  return { status: 200, jsonBody: { status: 'ok' } };
}

app.http('Health', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'health',
  /* v8 ignore next */
  handler: () => health(),
});

module.exports = { health };
