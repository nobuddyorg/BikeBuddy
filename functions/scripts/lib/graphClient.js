'use strict';

const { isUuid } = require('../../src/lib/validation');

const GRAPH_USERS_URL = 'https://graph.microsoft.com/v1.0/users/';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
// A hung call fails the id instead of the run; the next run retries it (a late 204 reads as 404).
const GRAPH_TIMEOUT_MS = 30_000;

function tokenUrl(tenantId) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/** Microsoft Graph as the deletion job's tenant-wide credential: one call, deleting one user. */
function createGraphClient({ fetch, tenantId, clientId, clientSecret }) {
  let accessTokenPromise;

  async function requestAccessToken() {
    const response = await fetch(tokenUrl(tenantId), {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: GRAPH_SCOPE,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Graph token request failed with status ${response.status}`);
    const { access_token: accessToken } = await response.json();
    if (typeof accessToken !== 'string')
      throw new Error('Graph token response has no access_token');
    return accessToken;
  }

  async function deleteUser(objectId) {
    // The adapter holding the tenant-wide credential guards itself, not only its caller.
    if (!isUuid(objectId)) throw new Error('Refusing a Graph call for an id that is not a GUID');
    accessTokenPromise ??= requestAccessToken();
    const response = await fetch(GRAPH_USERS_URL + encodeURIComponent(objectId), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${await accessTokenPromise}` },
      signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
    });
    if (response.status === 204) return 'deleted';
    if (response.status === 404) return 'alreadyGone';
    throw new Error(`Graph delete failed with status ${response.status}`);
  }

  return { deleteUser };
}

module.exports = { createGraphClient };
