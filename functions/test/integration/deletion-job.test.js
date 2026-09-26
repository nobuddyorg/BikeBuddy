'use strict';

// The deletion job against the emulator (#570): it deletes the identity the API queued, and
// rejects entries that do not look as the API leaves them. Graph is the only fake.

const { randomUUID } = require('node:crypto');
const db = require('../../src/lib/db');
const blobStorage = require('../../src/lib/blobStorage');
const { purgeAccountData } = require('../../src/lib/accountPurge');
const {
  createDeletionQueue,
  createAppUsers,
  processDeletions,
} = require('../../scripts/lib/deletionJob');
const { createGraphClient } = require('../../scripts/lib/graphClient');
const { CREDENTIALS, fakeGraphFetch } = require('../fakeGraph');
const { connectHarness } = require('./harness');
const { assertEmulatorTargets } = require('./emulatorGuard');

const quietLog = { info: () => {}, error: () => {} };

const queuedByApi = randomUUID();
const withoutAppUser = randomUUID();
const forActiveUser = randomUUID();
const OURS = [queuedByApi, withoutAppUser, forActiveUser];

let active;

beforeAll(async () => {
  // db.js reads the emulator the host was started against; the guard refuses anything else.
  const targets = assertEmulatorTargets();
  process.env.COSMOS_CONNECTION_STRING = targets.cosmosConnectionString;
  process.env.BLOB_CONNECTION_STRING = targets.blobConnectionString;
  process.env.COSMOS_DATABASE ??= 'bikebuddy';
  const harness = await connectHarness();

  const leaving = randomUUID();
  const leavingApi = harness.withToken(
    harness.tokens.tokenFor({ userId: leaving, claims: { oid: queuedByApi } }),
  );
  expect((await leavingApi.request('/me')).status).toBe(200);
  expect((await leavingApi.request('/account', { method: 'DELETE' })).status).toBe(204);

  active = harness.newUser();
  expect((await active.api.request('/me')).status).toBe(200);
  await db.upsertItem(db.deletionsContainer(), { id: withoutAppUser });
  await db.upsertItem(db.deletionsContainer(), { id: forActiveUser, userId: active.userId });
}, 60_000);

afterAll(async () => {
  for (const id of OURS) {
    await db.deleteItemIfExists(db.deletionsContainer(), { id, partitionKey: id });
  }
  await active?.api.deleteAccount();
});

// Other files queue identities too: this run sees only its own entries.
function ownQueue() {
  const queue = createDeletionQueue(db.deletionsContainer());
  return {
    ...queue,
    listIds: async () => (await queue.listIds()).filter((id) => OURS.includes(id)),
  };
}

test('deletes the identity the API queued and rejects the other two', async () => {
  const graph = fakeGraphFetch();

  const outcome = await processDeletions({
    queue: ownQueue(),
    appUsers: createAppUsers(db.usersContainer()),
    graph: createGraphClient({ fetch: graph.fetch, ...CREDENTIALS }),
    purgeAccount: (userId) =>
      purgeAccountData({
        userId,
        toursContainer: db.toursContainer,
        tracksContainer: db.tracksContainer,
        usersContainer: db.usersContainer,
        gpxContainer: blobStorage.gpxContainer,
        imagesContainer: blobStorage.imagesContainer,
      }),
    log: quietLog,
  });

  expect(outcome).toEqual({ deleted: 1, alreadyGone: 0, failed: 0, rejected: 2 });
  expect(graph.deletedIds()).toEqual([queuedByApi]);
  const remaining = await ownQueue().listIds();
  expect(remaining.sort()).toEqual([withoutAppUser, forActiveUser].sort());
  // The rejected entry's app user keeps everything.
  expect((await active.api.request('/me')).status).toBe(200);
});
