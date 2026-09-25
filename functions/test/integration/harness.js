'use strict';

// What a spec needs from globalSetup: the host's address and identities with real signed tokens.

const { randomUUID } = require('node:crypto');
const { apiClient } = require('./api');
const { tokenMinter } = require('./tokens');

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

/** Call from beforeAll: `inject` is only reachable through an ESM import. */
async function connectHarness() {
  const { inject } = await import('vitest');
  const { apiBaseUrl, signing } = inject('integration');
  const tokens = tokenMinter(signing);
  const withHeaders = (headers) => apiClient({ baseUrl: apiBaseUrl, headers });

  /** A user nobody else in the run shares: their own partition and blob prefix. */
  function newUser() {
    const userId = randomUUID();
    const token = tokens.tokenFor({
      userId,
      claims: { email: `${userId}@integration.test`, name: 'Integration Rider' },
    });
    return { userId, api: withHeaders(bearer(token)) };
  }

  return {
    tokens,
    newUser,
    anonymous: withHeaders({}),
    withToken: (token) => withHeaders(bearer(token)),
    withHeaders,
  };
}

module.exports = { connectHarness };
