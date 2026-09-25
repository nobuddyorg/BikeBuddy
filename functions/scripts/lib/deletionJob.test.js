'use strict';

const {
  partitionQueue,
  maskId,
  createGraphClient,
  createDeletionQueue,
  planDeletions,
  processDeletions,
  runDeletionJob,
} = require('./deletionJob');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer } = require('../../test/scriptFakes');

const USER_A = '11111111-1111-4111-8111-11111111aaaa';
const USER_B = '22222222-2222-4222-8222-22222222bbbb';
const USER_C = '33333333-3333-4333-8333-33333333cccc';
const GRAPH_USERS_URL = 'https://graph.microsoft.com/v1.0/users/';
const TOKEN_URL = 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token';
const CREDENTIALS = { tenantId: 'tenant-id', clientId: 'client-id', clientSecret: 'client-secret' };
const COSMOS_ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
};
const ENVIRONMENT = {
  ...COSMOS_ENVIRONMENT,
  GRAPH_TENANT_ID: 'tenant-id',
  GRAPH_CLIENT_ID: 'client-id',
  GRAPH_CLIENT_SECRET: 'client-secret',
};

function jsonResponse(status, body = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// A Graph stand-in: answers the token request, then each user DELETE with statusFor(id).
function fakeGraphFetch(statusFor = () => 204) {
  const calls = [];
  const fetch = vi.fn(async (url, init) => {
    calls.push({ url, init });
    if (url === TOKEN_URL) return jsonResponse(200, { access_token: 'graph-token' });
    const status = statusFor(decodeURIComponent(url.slice(GRAPH_USERS_URL.length)));
    if (status instanceof Error) throw status;
    return jsonResponse(status);
  });
  const deletedIds = () =>
    calls
      .filter(({ url }) => url.startsWith(GRAPH_USERS_URL))
      .map(({ url }) => decodeURIComponent(url.slice(GRAPH_USERS_URL.length)));
  return { fetch, calls, deletedIds };
}

function queueOf(ids) {
  return fakeCosmosContainer({
    documents: ids.map((id) => ({ id, requestedAt: '2026-01-01T00:00:00.000Z' })),
    answerQuery: (documents) => documents.map(({ id }) => ({ id })),
    partitionKeyOf: (document) => document.id,
  });
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

async function runReal({ ids, statusFor, log = recordingLog() }) {
  const queue = queueOf(ids);
  const graph = fakeGraphFetch(statusFor);
  const outcome = await processDeletions({
    queue: createDeletionQueue(queue.container),
    graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
    log,
  });
  return { outcome, queue, graph, log };
}

describe('partitionQueue', () => {
  it('keeps GUIDs and rejects everything else', () => {
    const ids = [USER_A, '../groups/x', 'a/b', '', 'not-a-guid', USER_B.toUpperCase()];

    expect(partitionQueue(ids)).toEqual({
      valid: [USER_A, USER_B.toUpperCase()],
      rejected: ['../groups/x', 'a/b', '', 'not-a-guid'],
    });
  });
});

describe('maskId', () => {
  it('shows only the last four characters', () => {
    expect(maskId(USER_A)).toBe('…aaaa');
  });
});

describe('createGraphClient', () => {
  it('deletes the user by its encoded id with a client-credentials token', async () => {
    const graph = fakeGraphFetch();
    const client = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS });

    await expect(client.deleteUser(USER_A)).resolves.toBe('deleted');

    const [tokenCall, deleteCall] = graph.calls;
    expect(tokenCall.url).toBe(TOKEN_URL);
    expect(tokenCall.init.method).toBe('POST');
    expect(Object.fromEntries(tokenCall.init.body)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    expect(deleteCall).toEqual({
      url: `${GRAPH_USERS_URL}${USER_A}`,
      init: { method: 'DELETE', headers: { Authorization: 'Bearer graph-token' } },
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
      expect(graph.fetch).not.toHaveBeenCalled();
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

describe('createDeletionQueue', () => {
  it('lists every queued id page by page', async () => {
    const ids = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => `id-${index}`);
    const queue = queueOf(ids);

    await expect(createDeletionQueue(queue.container).listIds()).resolves.toEqual(ids);
    expect(queue.queries).toEqual([
      { query: 'SELECT c.id FROM c', options: { maxItemCount: PAGE_SIZE } },
    ]);
  });

  it('removes an entry by its id as partition key', async () => {
    const queue = queueOf([USER_A, USER_B]);

    await createDeletionQueue(queue.container).remove(USER_A);

    expect(queue.writes).toEqual([{ delete: USER_A, partitionKey: USER_A }]);
    expect(queue.documents.map(({ id }) => id)).toEqual([USER_B]);
  });

  it('treats an entry that is already gone as removed', async () => {
    const queue = queueOf([]);

    await expect(createDeletionQueue(queue.container).remove(USER_A)).resolves.toBeUndefined();
  });

  it('rethrows any other failure', async () => {
    const failure = Object.assign(new Error('throttled'), { code: 429 });
    const container = { item: () => ({ delete: async () => Promise.reject(failure) }) };

    await expect(createDeletionQueue(container).remove(USER_A)).rejects.toBe(failure);
  });
});

describe('processDeletions', () => {
  it('deletes each queued user and removes its entry on 204 and on 404', async () => {
    const { outcome, queue, graph, log } = await runReal({
      ids: [USER_A, USER_B],
      statusFor: (id) => (id === USER_A ? 204 : 404),
    });

    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(queue.documents).toEqual([]);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 1, failed: 0, rejected: 0 });
    expect(log.lines).toEqual([
      '…aaaa: deleted',
      '…bbbb: already gone',
      'Done: 1 deleted, 1 already gone, 0 failed, 0 rejected.',
    ]);
  });

  it('never sends a non-GUID id to Graph and leaves it queued', async () => {
    const hostile = ['../groups/x', 'a/b', '..', 'not-a-guid'];
    const { outcome, queue, graph } = await runReal({ ids: [...hostile, USER_A] });

    expect(graph.deletedIds()).toEqual([USER_A]);
    expect(queue.documents.map(({ id }) => id)).toEqual(hostile);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 0, rejected: 4 });
  });

  it.each([429, 500, 503])(
    'keeps the entry on %i and carries on with the next id',
    async (status) => {
      const { outcome, queue, graph } = await runReal({
        ids: [USER_A, USER_B],
        statusFor: (id) => (id === USER_A ? status : 204),
      });

      expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
      expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
      expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
    },
  );

  it('counts a network error as a failure and carries on', async () => {
    const { outcome, queue } = await runReal({
      ids: [USER_A, USER_B],
      statusFor: (id) => (id === USER_A ? new TypeError('fetch failed') : 204),
    });

    expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
  });

  it('carries on when a queue entry vanished before its removal', async () => {
    const queue = queueOf([USER_A, USER_B]);
    const remove = vi.fn(async (id) => {
      queue.documents.splice(0, queue.documents.length);
      await createDeletionQueue(queue.container).remove(id);
    });
    const graph = fakeGraphFetch();

    const outcome = await processDeletions({
      queue: { listIds: createDeletionQueue(queue.container).listIds, remove },
      graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
      log: recordingLog(),
    });

    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(outcome).toEqual({ deleted: 2, alreadyGone: 0, failed: 0, rejected: 0 });
  });

  it('counts a failed queue removal as a failure and carries on', async () => {
    const queue = queueOf([USER_A, USER_B]);
    const adapter = createDeletionQueue(queue.container);
    const log = recordingLog();
    const remove = async (id) => {
      if (id === USER_A) throw new Error(`Request to docs/${USER_A} timed out`);
      await adapter.remove(id);
    };

    const outcome = await processDeletions({
      queue: { listIds: adapter.listIds, remove },
      graph: createGraphClient({ fetch: fakeGraphFetch().fetch, ...CREDENTIALS }),
      log,
    });

    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
    expect(log.lines).toContain(
      '…aaaa: failed, stays queued for the next run (Request to docs/…aaaa timed out)',
    );
  });

  it('is idempotent: a second run finds nothing left to do', async () => {
    const first = await runReal({ ids: [USER_A] });
    const graph = fakeGraphFetch();

    const outcome = await processDeletions({
      queue: createDeletionQueue(first.queue.container),
      graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
      log: recordingLog(),
    });

    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 0, rejected: 0 });
    expect(graph.fetch).not.toHaveBeenCalled();
  });

  it('logs counts and masked ids, never a full object id', async () => {
    const { log } = await runReal({
      ids: [USER_A, USER_B, USER_C, '../groups/x'],
      statusFor: (id) => ({ [USER_A]: 204, [USER_B]: 404 })[id] ?? 500,
    });

    expect(log.lines).toEqual([
      '1 queued id(s) are not GUIDs: left in the queue, never sent to Graph.',
      '…aaaa: deleted',
      '…bbbb: already gone',
      '…cccc: failed, stays queued for the next run (Graph delete failed with status 500)',
      'Done: 1 deleted, 1 already gone, 1 failed, 1 rejected.',
    ]);
  });
});

describe('planDeletions', () => {
  it('lists what a run would delete and changes nothing', async () => {
    const queue = queueOf([USER_A, 'a/b', USER_B]);
    const log = recordingLog();

    const outcome = await planDeletions({ queue: createDeletionQueue(queue.container), log });

    expect(queue.writes).toEqual([]);
    expect(queue.documents).toHaveLength(3);
    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 0, rejected: 1 });
    expect(log.lines).toEqual([
      '1 queued id(s) are not GUIDs: left in the queue, never sent to Graph.',
      'Would delete …aaaa',
      'Would delete …bbbb',
      'Dry run, nothing changed: 2 would be deleted, 1 rejected.',
    ]);
  });
});

describe('runDeletionJob', () => {
  function run({ argv = [], environment = ENVIRONMENT, ids = [USER_A], statusFor } = {}) {
    const queue = queueOf(ids);
    const graph = fakeGraphFetch(statusFor);
    const log = recordingLog();
    const openDeletionsContainer = vi.fn(() => queue.container);
    const exitCode = runDeletionJob({
      argv,
      environment,
      fetch: graph.fetch,
      openDeletionsContainer,
      log,
    });
    return { exitCode, queue, graph, log, openDeletionsContainer };
  }

  it('drains the queue and exits 0', async () => {
    const { exitCode, queue, graph } = run({ ids: [USER_A, USER_B] });

    await expect(exitCode).resolves.toBe(0);
    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(queue.documents).toEqual([]);
  });

  it('exits 1 when any deletion failed', async () => {
    const { exitCode } = run({ statusFor: () => 500 });

    await expect(exitCode).resolves.toBe(1);
  });

  it('exits 1 when any queued id was rejected', async () => {
    const { exitCode } = run({ ids: [USER_A, '../x'] });

    await expect(exitCode).resolves.toBe(1);
  });

  it('makes no Graph call and no write on a dry run, without needing the Graph credential', async () => {
    const { exitCode, queue, graph } = run({
      argv: ['--dry-run'],
      environment: COSMOS_ENVIRONMENT,
    });

    await expect(exitCode).resolves.toBe(0);
    expect(graph.fetch).not.toHaveBeenCalled();
    expect(queue.writes).toEqual([]);
  });

  it('exits 1 on a dry run that finds a rejected id', async () => {
    const { exitCode, queue } = run({ argv: ['--dry-run'], ids: ['../x'] });

    await expect(exitCode).resolves.toBe(1);
    expect(queue.writes).toEqual([]);
  });

  it('refuses an unknown flag before touching anything', async () => {
    const { exitCode, graph, openDeletionsContainer, log } = run({ argv: ['--dryrun'] });

    await expect(exitCode).resolves.toBe(1);
    expect(openDeletionsContainer).not.toHaveBeenCalled();
    expect(graph.fetch).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain("Unknown option '--dryrun'");
  });

  it('names the missing Cosmos variables before opening the queue', async () => {
    const { exitCode, openDeletionsContainer, log } = run({ environment: {} });

    await expect(exitCode).resolves.toBe(1);
    expect(openDeletionsContainer).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain(
      'Missing environment variables: COSMOS_CONNECTION_STRING, COSMOS_DATABASE',
    );
  });

  it('names the missing Graph variables before calling Graph', async () => {
    const { exitCode, graph, queue, log } = run({
      environment: { ...ENVIRONMENT, GRAPH_CLIENT_SECRET: '' },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(graph.fetch).not.toHaveBeenCalled();
    expect(queue.writes).toEqual([]);
    expect(log.lines.join('\n')).toContain('Missing environment variables: GRAPH_CLIENT_SECRET');
  });
});
