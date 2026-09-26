'use strict';

const {
  partitionQueue,
  idHash,
  createDeletionQueue,
  createAppUsers,
  planDeletions,
  processDeletions,
  runDeletionJob,
} = require('./deletionJob');
const { createGraphClient } = require('./graphClient');
const { PAGE_SIZE } = require('./queryItems');
const { fakeCosmosContainer } = require('../../test/scriptFakes');
const { USER_A, USER_B, USER_C, CREDENTIALS, fakeGraphFetch } = require('../../test/fakeGraph');

const COSMOS_ENVIRONMENT = {
  COSMOS_CONNECTION_STRING: 'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
  COSMOS_DATABASE: 'bikebuddy',
};
const ENVIRONMENT = {
  ...COSMOS_ENVIRONMENT,
  BLOB_CONNECTION_STRING: 'UseDevelopmentStorage=true',
  GRAPH_TENANT_ID: 'tenant-id',
  GRAPH_CLIENT_ID: 'client-id',
  GRAPH_CLIENT_SECRET: 'client-secret',
};

// As DeleteAccount queues it: the directory object id, with the app user (token sub) it belongs to.
const queued = (id) => ({ id, userId: `sub-${id.slice(-4)}` });

// An entry is an id alone (queued before #538, no app user) or an object.
function queueOf(entries) {
  return fakeCosmosContainer({
    documents: entries.map((entry) => ({
      requestedAt: '2026-01-01T00:00:00.000Z',
      ...(typeof entry === 'string' ? { id: entry } : entry),
    })),
    answerQuery: (documents) => documents.map(({ id }) => ({ id })),
    partitionKeyOf: (document) => document.id,
  });
}

// The app users that still have a document, by their token sub.
function usersOf(userIds = []) {
  return fakeCosmosContainer({
    documents: userIds.map((id) => ({ id })),
    answerQuery: () => [],
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

async function runReal({
  entries,
  users = [],
  statusFor,
  log = recordingLog(),
  purgeAccount = vi.fn(),
}) {
  const queue = queueOf(entries);
  const graph = fakeGraphFetch(statusFor);
  const outcome = await processDeletions({
    queue: createDeletionQueue(queue.container),
    appUsers: createAppUsers(usersOf(users).container),
    graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
    purgeAccount,
    log,
  });
  return { outcome, queue, graph, log, purgeAccount };
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

describe('idHash', () => {
  it('names an id by eight hex digits of its SHA-256, holding none of the id', () => {
    expect(idHash(USER_A)).toBe('id#19629c4e');
    expect(idHash(USER_A)).not.toContain('aaaa');
    expect(idHash(USER_B)).not.toBe(idHash(USER_A));
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

  it('reads the app user an entry was queued for, by its id as partition key', async () => {
    const queue = queueOf([{ id: USER_A, userId: 'sub-a' }, USER_B]);
    const adapter = createDeletionQueue(queue.container);

    await expect(adapter.appUserOf(USER_A)).resolves.toBe('sub-a');
    await expect(adapter.appUserOf(USER_B)).resolves.toBeUndefined();
    await expect(adapter.appUserOf(USER_C)).resolves.toBeUndefined();
  });

  it('reads no app user when the SDK answers a missing entry without throwing', async () => {
    const container = { item: () => ({ read: async () => ({ resource: undefined }) }) };

    await expect(createDeletionQueue(container).appUserOf(USER_A)).resolves.toBeUndefined();
  });

  it('rethrows a failed read that is not a 404', async () => {
    const container = {
      item: () => ({
        read: async () => Promise.reject(Object.assign(new Error('throttled'), { code: 429 })),
      }),
    };

    await expect(createDeletionQueue(container).appUserOf(USER_A)).rejects.toThrow('throttled');
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

describe('createAppUsers', () => {
  it('reads a user document by the sub as id and partition key', async () => {
    const users = createAppUsers(usersOf(['sub-a']).container);

    await expect(users.exists('sub-a')).resolves.toBe(true);
    await expect(users.exists('sub-b')).resolves.toBe(false);
  });

  it('reads a missing document the emulator answers without throwing as gone', async () => {
    const container = { item: () => ({ read: async () => ({ resource: undefined }) }) };

    await expect(createAppUsers(container).exists('sub-a')).resolves.toBe(false);
  });

  it('rethrows a failed read that is not a 404', async () => {
    const container = {
      item: () => ({
        read: async () => Promise.reject(Object.assign(new Error('throttled'), { code: 429 })),
      }),
    };

    await expect(createAppUsers(container).exists('sub-a')).rejects.toThrow('throttled');
  });
});

describe('processDeletions', () => {
  it('deletes each queued user and removes its entry on 204 and on 404', async () => {
    const { outcome, queue, graph, log } = await runReal({
      entries: [queued(USER_A), queued(USER_B)],
      statusFor: (id) => (id === USER_A ? 204 : 404),
    });

    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(queue.documents).toEqual([]);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 1, failed: 0, rejected: 0 });
    expect(log.lines).toEqual([
      `${idHash(USER_A)}: deleted`,
      `${idHash(USER_B)}: already gone`,
      'Done: 1 deleted, 1 already gone, 0 failed, 0 rejected.',
    ]);
  });

  it('never sends a non-GUID id to Graph and leaves it queued', async () => {
    const hostile = ['../groups/x', 'a/b', '..', 'not-a-guid'].map((id) => ({ id, userId: 's' }));
    const { outcome, queue, graph } = await runReal({ entries: [...hostile, queued(USER_A)] });

    expect(graph.deletedIds()).toEqual([USER_A]);
    expect(queue.documents.map(({ id }) => id)).toEqual(hostile.map(({ id }) => id));
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 0, rejected: 4 });
  });

  // Anyone who can write the queue could otherwise name any identity in the tenant (#570).
  it('rejects an entry that names no app user, deleting and purging nothing', async () => {
    const { outcome, queue, graph, purgeAccount, log } = await runReal({
      entries: [USER_A, queued(USER_B)],
    });

    expect(graph.deletedIds()).toEqual([USER_B]);
    expect(purgeAccount).toHaveBeenCalledTimes(1);
    expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 0, rejected: 1 });
    expect(log.lines).toContain(
      `${idHash(USER_A)}: rejected, stays queued ` +
        '(it names no app user, so nothing shows the API queued it)',
    );
  });

  it('rejects an entry whose app user still has a document: the API never deleted it', async () => {
    const { outcome, queue, graph, purgeAccount, log } = await runReal({
      entries: [queued(USER_A)],
      users: [queued(USER_A).userId],
    });

    expect(graph.calls).toEqual([]);
    expect(purgeAccount).not.toHaveBeenCalled();
    expect(queue.documents).toHaveLength(1);
    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 0, rejected: 1 });
    expect(log.lines).toContain(
      `${idHash(USER_A)}: rejected, stays queued ` +
        '(its app user still has a document, so the API did not delete it)',
    );
  });

  // An empty or path-like userId would widen the blob prefix past one user.
  it.each([[''], ['a/b'], ['../x'], [42], [null]])(
    'rejects the queued userId %j before any purge or Graph call',
    async (userId) => {
      const { outcome, purgeAccount, graph, log } = await runReal({
        entries: [{ id: USER_A, userId }],
      });

      expect(log.lines).toContain(
        `${idHash(USER_A)}: rejected, stays queued (its app user id is not a token subject)`,
      );
      expect(purgeAccount).not.toHaveBeenCalled();
      expect(graph.calls).toEqual([]);
      expect(outcome.rejected).toBe(1);
    },
  );

  it.each([429, 500, 503])(
    'keeps the entry on %i and carries on with the next id',
    async (status) => {
      const { outcome, queue, graph } = await runReal({
        entries: [queued(USER_A), queued(USER_B)],
        statusFor: (id) => (id === USER_A ? status : 204),
      });

      expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
      expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
      expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
    },
  );

  it('counts a network error as a failure and carries on', async () => {
    const { outcome, queue } = await runReal({
      entries: [queued(USER_A), queued(USER_B)],
      statusFor: (id) => (id === USER_A ? new TypeError('fetch failed') : 204),
    });

    expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
  });

  it('counts a failed check of the app user as a failure, deleting nothing', async () => {
    const queue = queueOf([queued(USER_A)]);
    const graph = fakeGraphFetch();
    const throttled = Object.assign(new Error('throttled'), { code: 429 });
    const log = recordingLog();

    const outcome = await processDeletions({
      queue: createDeletionQueue(queue.container),
      appUsers: { exists: async () => Promise.reject(throttled) },
      graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
      purgeAccount: vi.fn(),
      log,
    });

    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 1, rejected: 0 });
    expect(graph.calls).toEqual([]);
    expect(log.lines).toContain(
      `${idHash(USER_A)}: failed, stays queued for the next run (throttled)`,
    );
  });

  it('carries on when a queue entry vanished before its removal', async () => {
    const queue = queueOf([queued(USER_A), queued(USER_B)]);
    const adapter = createDeletionQueue(queue.container);
    // Another run removed it first: the removal meets a 404.
    const remove = vi.fn(async (id) => {
      queue.documents.splice(
        queue.documents.findIndex((document) => document.id === id),
        1,
      );
      await adapter.remove(id);
    });
    const graph = fakeGraphFetch();

    const outcome = await processDeletions({
      queue: { listIds: adapter.listIds, appUserOf: adapter.appUserOf, remove },
      appUsers: createAppUsers(usersOf().container),
      graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
      purgeAccount: vi.fn(),
      log: recordingLog(),
    });

    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(outcome).toEqual({ deleted: 2, alreadyGone: 0, failed: 0, rejected: 0 });
  });

  it('counts a failed queue removal as a failure, logging neither id', async () => {
    const queue = queueOf([queued(USER_A), queued(USER_B)]);
    const adapter = createDeletionQueue(queue.container);
    const log = recordingLog();
    const { userId } = queued(USER_A);
    const remove = async (id) => {
      if (id === USER_A) throw new Error(`Request to docs/${USER_A} for ${userId} timed out`);
      await adapter.remove(id);
    };

    const outcome = await processDeletions({
      queue: { listIds: adapter.listIds, appUserOf: adapter.appUserOf, remove },
      appUsers: createAppUsers(usersOf().container),
      graph: createGraphClient({ fetch: fakeGraphFetch().fetch, ...CREDENTIALS }),
      purgeAccount: vi.fn(),
      log,
    });

    expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 1, rejected: 0 });
    expect(log.lines).toContain(
      `${idHash(USER_A)}: failed, stays queued for the next run ` +
        `(Request to docs/${idHash(USER_A)} for ${idHash(userId)} timed out)`,
    );
  });

  it("purges the queued app user's data before deleting the identity", async () => {
    const order = [];
    const purgeAccount = vi.fn(async (userId) => order.push(`purge ${userId}`));
    const graph = fakeGraphFetch();
    const queue = queueOf([{ id: USER_A, userId: 'sub-a_1' }]);
    const deleteUser = createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }).deleteUser;

    const outcome = await processDeletions({
      queue: createDeletionQueue(queue.container),
      appUsers: createAppUsers(usersOf().container),
      graph: { deleteUser: async (id) => (order.push(`graph ${id}`), deleteUser(id)) },
      purgeAccount,
      log: recordingLog(),
    });

    expect(order).toEqual(['purge sub-a_1', `graph ${USER_A}`]);
    expect(outcome.deleted).toBe(1);
    expect(queue.documents).toEqual([]);
  });

  it('keeps the identity and the entry when the purge fails, for the next run', async () => {
    const purgeAccount = vi.fn(async () => {
      throw new Error(
        'The documents of the account are gone, but some of its blobs were not deleted',
      );
    });
    const { outcome, queue, graph } = await runReal({ entries: [queued(USER_A)], purgeAccount });

    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 1, rejected: 0 });
    expect(graph.deletedIds()).toEqual([]);
    expect(queue.documents.map(({ id }) => id)).toEqual([USER_A]);
  });

  it('is idempotent: a second run finds nothing left to do', async () => {
    const first = await runReal({ entries: [queued(USER_A)] });
    const graph = fakeGraphFetch();

    const outcome = await processDeletions({
      queue: createDeletionQueue(first.queue.container),
      appUsers: createAppUsers(usersOf().container),
      graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
      purgeAccount: vi.fn(),
      log: recordingLog(),
    });

    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 0, rejected: 0 });
    expect(graph.calls).toEqual([]);
  });

  it('logs counts and hashes, never an object id or a part of one', async () => {
    const { log } = await runReal({
      entries: [queued(USER_A), queued(USER_B), queued(USER_C), { id: '../groups/x' }],
      statusFor: (id) => ({ [USER_A]: 204, [USER_B]: 404 })[id] ?? 500,
    });

    expect(log.lines).toEqual([
      '1 queued id(s) are not GUIDs: left in the queue, never sent to Graph.',
      `${idHash(USER_A)}: deleted`,
      `${idHash(USER_B)}: already gone`,
      `${idHash(USER_C)}: failed, stays queued for the next run (Graph delete failed with status 500)`,
      'Done: 1 deleted, 1 already gone, 1 failed, 1 rejected.',
    ]);
    for (const id of [USER_A, USER_B, USER_C]) {
      expect(log.lines.join('\n')).not.toContain(id.slice(-4));
    }
  });
});

describe('planDeletions', () => {
  it('lists what a run would delete and reject, and changes nothing', async () => {
    const queue = queueOf([queued(USER_A), 'a/b', USER_B, queued(USER_C)]);
    const users = usersOf([queued(USER_C).userId]);
    const log = recordingLog();

    const outcome = await planDeletions({
      queue: createDeletionQueue(queue.container),
      appUsers: createAppUsers(users.container),
      log,
    });

    expect(queue.writes).toEqual([]);
    expect(users.writes).toEqual([]);
    expect(outcome).toEqual({ deleted: 0, alreadyGone: 0, failed: 0, rejected: 3 });
    expect(log.lines).toEqual([
      '1 queued id(s) are not GUIDs: left in the queue, never sent to Graph.',
      `Would purge the app data of and delete ${idHash(USER_A)}`,
      `Would reject ${idHash(USER_B)}: it names no app user, so nothing shows the API queued it`,
      `Would reject ${idHash(USER_C)}: ` +
        'its app user still has a document, so the API did not delete it',
      'Dry run, nothing changed: 1 would be deleted, 3 rejected.',
    ]);
  });
});

describe('runDeletionJob', () => {
  function run({
    argv = [],
    environment = ENVIRONMENT,
    entries = [queued(USER_A)],
    statusFor,
  } = {}) {
    const queue = queueOf(entries);
    const users = usersOf();
    const graph = fakeGraphFetch(statusFor);
    const log = recordingLog();
    const openDeletionsContainer = vi.fn(() => queue.container);
    const exitCode = runDeletionJob({
      argv,
      environment,
      fetch: graph.fetch,
      openDeletionsContainer,
      openUsersContainer: () => users.container,
      purgeAccount: vi.fn(),
      log,
    });
    return { exitCode, queue, graph, log, openDeletionsContainer };
  }

  it('drains the queue and exits 0', async () => {
    const { exitCode, queue, graph } = run({ entries: [queued(USER_A), queued(USER_B)] });

    await expect(exitCode).resolves.toBe(0);
    expect(graph.deletedIds()).toEqual([USER_A, USER_B]);
    expect(queue.documents).toEqual([]);
  });

  it('exits 1 when any deletion failed', async () => {
    const { exitCode } = run({ statusFor: () => 500 });

    await expect(exitCode).resolves.toBe(1);
  });

  it.each([
    ['a queued id that is not a GUID', { id: '../x', userId: 's' }],
    ['an entry that names no app user', USER_B],
  ])('exits 1 for %s', async (_label, entry) => {
    const { exitCode } = run({ entries: [queued(USER_A), entry] });

    await expect(exitCode).resolves.toBe(1);
  });

  it('makes no Graph call and no write on a dry run, without needing the Graph credential', async () => {
    const { exitCode, queue, graph } = run({
      argv: ['--dry-run'],
      environment: COSMOS_ENVIRONMENT,
    });

    await expect(exitCode).resolves.toBe(0);
    expect(graph.calls).toEqual([]);
    expect(queue.writes).toEqual([]);
  });

  it('exits 1 on a dry run that finds an entry it would reject', async () => {
    const { exitCode, queue } = run({ argv: ['--dry-run'], entries: [USER_A] });

    await expect(exitCode).resolves.toBe(1);
    expect(queue.writes).toEqual([]);
  });

  it('refuses an unknown flag before touching anything', async () => {
    const { exitCode, graph, openDeletionsContainer, log } = run({ argv: ['--dryrun'] });

    await expect(exitCode).resolves.toBe(1);
    expect(openDeletionsContainer).not.toHaveBeenCalled();
    expect(graph.calls).toEqual([]);
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

  it('needs the Storage connection string to purge, and says so before calling Graph', async () => {
    const { exitCode, graph, log } = run({
      environment: { ...ENVIRONMENT, BLOB_CONNECTION_STRING: '' },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(graph.calls).toEqual([]);
    expect(log.lines.join('\n')).toContain('Missing environment variables: BLOB_CONNECTION_STRING');
  });

  it('names the missing Graph variables before calling Graph', async () => {
    const { exitCode, graph, queue, log } = run({
      environment: { ...ENVIRONMENT, GRAPH_CLIENT_SECRET: '' },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(graph.calls).toEqual([]);
    expect(queue.writes).toEqual([]);
    expect(log.lines.join('\n')).toContain('Missing environment variables: GRAPH_CLIENT_SECRET');
  });
});
