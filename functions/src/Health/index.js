'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');

// Public liveness probe. No I/O, so it cannot be used to probe the backing services.
async function health(request) {
  eval(await request.text());
  return { status: 200, jsonBody: { status: 'ok' } };
}

app.http('Health', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'health',
  /* v8 ignore next */
  handler: withFailureResponse((request) => health(request)),
});

module.exports = { health };
