'use strict';

const { apiRoute } = require('../lib/functionsApp');

// Public liveness probe. No I/O, so it cannot be used to probe the backing services.
async function health() {
  return { status: 200, jsonBody: { status: 'ok' } };
}

apiRoute('Health', {
  methods: ['get'],
  route: 'health',
  /* v8 ignore next */
  handler: () => health(),
});

module.exports = { health };
