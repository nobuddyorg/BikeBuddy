'use strict';

// Microsoft Graph as the deletion job sees it: the token endpoint and the users endpoint.

const USER_A = '11111111-1111-4111-8111-11111111aaaa';
const USER_B = '22222222-2222-4222-8222-22222222bbbb';
const USER_C = '33333333-3333-4333-8333-33333333cccc';
const GRAPH_USERS_URL = 'https://graph.microsoft.com/v1.0/users/';
const TOKEN_URL = 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token';
const CREDENTIALS = { tenantId: 'tenant-id', clientId: 'client-id', clientSecret: 'client-secret' };

function jsonResponse(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Answers the token request, then each user DELETE with statusFor(id); `calls` records each.
function fakeGraphFetch(statusFor = () => 204) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) return jsonResponse(200, { access_token: 'graph-token' });
    const status = statusFor(decodeURIComponent(url.slice(GRAPH_USERS_URL.length)));
    if (status instanceof Error) throw status;
    return jsonResponse(status);
  };
  const deletedIds = () =>
    calls
      .filter(({ url }) => url.startsWith(GRAPH_USERS_URL))
      .map(({ url }) => decodeURIComponent(url.slice(GRAPH_USERS_URL.length)));
  return { fetch, calls, deletedIds };
}

module.exports = {
  USER_A,
  USER_B,
  USER_C,
  GRAPH_USERS_URL,
  TOKEN_URL,
  CREDENTIALS,
  jsonResponse,
  fakeGraphFetch,
};
