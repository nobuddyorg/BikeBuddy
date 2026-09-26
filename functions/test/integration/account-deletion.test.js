'use strict';

// The widest reach in the API: alice's deletion removes all of hers and nothing of bob's.

const { randomUUID } = require('node:crypto');
const db = require('../../src/lib/db');
const { connectHarness } = require('./harness');
const { assertEmulatorTargets } = require('./emulatorGuard');
const { SAMPLE_GPX } = require('./api');
const { ownerView, signedUrlsOf, statusOf } = require('./views');
const { geotaggedJpeg } = require('../fixtures/jpegs');

let alice;
let bob;

async function seedTourWithPhoto(user, jpeg) {
  const tourId = await user.api.createTour({ name: `Account deletion ${randomUUID()}` });
  await user.api.addPhoto({ tourId, jpeg });
  return { tourId };
}

beforeAll(async () => {
  const harness = await connectHarness();
  alice = harness.newUser();
  bob = harness.newUser();
  const jpeg = await geotaggedJpeg();
  alice.target = await seedTourWithPhoto(alice, jpeg);
  bob.target = await seedTourWithPhoto(bob, jpeg);
  alice.urls = signedUrlsOf(await alice.api.readJson(`/tours/${alice.target.tourId}`));
  alice.before = await ownerView(alice.api, alice.target);
  bob.before = await ownerView(bob.api, bob.target);
}, 60_000);

// Deleting an account twice is safe, so alice's cleanup may repeat what the test did.
afterAll(async () => {
  await Promise.all([alice?.api.deleteAccount(), bob?.api.deleteAccount()]);
});

describe('DELETE /api/account', () => {
  test("removes alice's tours, profile and blobs, and leaves bob's untouched", async () => {
    expect(alice.before.profile.id).toBe(alice.userId);
    expect(alice.before.exportedTours).toHaveLength(1);
    expect(alice.urls).toHaveLength(3);
    for (const url of alice.urls) expect(await statusOf(url)).toBe(200);
    expect(bob.before.blobStatuses).toEqual([200, 200, 200]);

    const response = await alice.api.request('/account', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(await alice.api.readJson('/tours')).toEqual([]);
    expect(await alice.api.readJson('/me/export')).toMatchObject({ user: null, tours: [] });
    // Her URLs are still signed and unexpired: a 404 means the blob itself is gone.
    for (const url of alice.urls) expect(await statusOf(url)).toBe(404);
    expect(await ownerView(bob.api, bob.target)).toEqual(bob.before);
  });

  test('answers 204 again when repeated, and still leaves bob untouched', async () => {
    const response = await alice.api.request('/account', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(await ownerView(bob.api, bob.target)).toEqual(bob.before);
  });
});

// Until the job deletes the identity, the same Entra user signing in again must not recreate data.
describe('a sign-in while the account deletion is queued', () => {
  const oid = randomUUID();
  let deletions;
  let carol;

  beforeAll(async () => {
    // db.js reads the emulator the host was started against; the guard refuses anything else.
    process.env.COSMOS_CONNECTION_STRING = assertEmulatorTargets().cosmosConnectionString;
    process.env.COSMOS_DATABASE ??= 'bikebuddy';
    deletions = db.deletionsContainer();
    const harness = await connectHarness();
    const userId = randomUUID();
    carol = {
      userId,
      api: harness.withToken(harness.tokens.tokenFor({ userId, claims: { oid } })),
    };
    expect((await carol.api.request('/me')).status).toBe(200);
    expect((await carol.api.request('/account', { method: 'DELETE' })).status).toBe(204);
  });

  afterAll(async () => {
    await db.deleteItemIfExists(deletions, { id: oid, partitionKey: oid });
  });

  test('queues the identity with the app user it belongs to', async () => {
    const queued = await db.readItem(deletions, { id: oid, partitionKey: oid });

    expect(queued).toMatchObject({ id: oid, userId: carol.userId });
  });

  test.each([
    ['GET /me', () => carol.api.request('/me')],
    [
      'PATCH /me',
      () => carol.api.sendJson('/me', { method: 'PATCH', body: { name: 'Carol again' } }),
    ],
    ['POST /tours/upload', () => carol.api.uploadTour({ name: 'After deletion', gpx: SAMPLE_GPX })],
  ])('%s answers 410 and creates nothing', async (_name, send) => {
    const response = await send();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'errors.accountDeleted' });
    expect(await carol.api.readJson('/tours')).toEqual([]);
    expect(await carol.api.readJson('/me/export')).toMatchObject({ user: null, tours: [] });
  });
});
