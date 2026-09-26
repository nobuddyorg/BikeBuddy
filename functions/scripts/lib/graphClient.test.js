'use strict';

const { createGraphClient } = require('./graphClient');
const {
  USER_A,
  USER_B,
  TOKEN_URL,
  GRAPH_USERS_URL,
  CREDENTIALS,
  jsonResponse,
  fakeGraphFetch,
} = require('../../test/fakeGraph');

describe('createGraphClient', () => {
  it('deletes the user by its encoded id with a client-credentials token', async () => {
    const graph = fakeGraphFetch();
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).resolves.toBe('deleted');

    const [tokenCall, deleteCall] = graph.calls;
    expect(tokenCall.url).toBe(TOKEN_URL);
    expect(tokenCall.init.method).toBe('POST');
    expect(tokenCall.init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.fromEntries(tokenCall.init.body)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    expect(deleteCall).toEqual({
      url: `${GRAPH_USERS_URL}${USER_A}`,
      init: {
        method: 'DELETE',
        headers: { Authorization: 'Bearer graph-token' },
        signal: expect.any(AbortSignal),
      },
    });
  });

  it('encodes the tenant id into the token URL', async () => {
    const graph = fakeGraphFetch();
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS, tenantId: 'a/b' });

    await client.deleteUser(USER_A).catch(() => {});

    expect(graph.calls[0].url).toBe('https://login.microsoftonline.com/a%2Fb/oauth2/v2.0/token');
  });

  it('requests one token for the whole run', async () => {
    const graph = fakeGraphFetch();
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

    await client.deleteUser(USER_A);
    await client.deleteUser(USER_B);

    expect(graph.calls.filter(({ url }) => url === TOKEN_URL)).toHaveLength(1);
  });

  it('treats 404 as already gone', async () => {
    const graph = fakeGraphFetch(() => 404);
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).resolves.toBe('alreadyGone');
  });

  it.each([429, 500, 503, 200, 400])('fails on status %i', async (status) => {
    const graph = fakeGraphFetch(() => status);
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).rejects.toThrow(
      `Graph delete failed with status ${status}`,
    );
  });

  it.each(['../groups/11111111-1111-4111-8111-111111111111', 'a/b', '..', '', 42])(
    'never calls Graph for %j',
    async (id) => {
      const graph = fakeGraphFetch();
      const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

      await expect(client.deleteUser(id)).rejects.toThrow('not a GUID');
      expect(graph.calls).toEqual([]);
    },
  );

  it('fails when the token request is refused, without calling the users endpoint', async () => {
    const fetch = vi.fn(async () => jsonResponse(401));
    const client = createGraphClient({ fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).rejects.toThrow(
      'Graph token request failed with status 401',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails when the token response carries no access token', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, { error: 'nope' }));
    const client = createGraphClient({ fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).rejects.toThrow('no access_token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
