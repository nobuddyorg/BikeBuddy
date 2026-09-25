'use strict';

const { deleteAccount } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const {
  fakeToursContainer,
  fakeUsersContainer,
  cosmosError,
} = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer, fakeGpxContainer } = require('../../test/fakes/blobContainer');
const { signedInAs, signedOut, fixedClock, NOW } = require('../../test/fakes/collaborators');

const tourOf = (userId, id) => ({ id, userId, name: `${userId} ${id}` });
// u1x shares u1's leading characters, so a prefix without the slash would reach it.
const USERS = [
  { id: 'u1', name: 'Ada' },
  { id: 'u2', name: 'Grace' },
  { id: 'u1x', name: 'Lin' },
];
const TOURS = [tourOf('u1', 't1'), tourOf('u1', 't2'), tourOf('u2', 't3'), tourOf('u1x', 't4')];
const GPX_BLOBS = ['u1/t1.gpx', 'u1/t2.gpx', 'u2/t3.gpx', 'u1x/t4.gpx'];
const IMAGE_BLOBS = ['u1/t1/p.jpg', 'u1/t1/p_thumb.jpg', 'u2/t3/q.jpg', 'u1x/t4/r.jpg'];

function setUp({ authenticate = signedInAs('u1') } = {}) {
  const users = fakeUsersContainer(USERS);
  const tours = fakeToursContainer(TOURS);
  const deletions = fakeUsersContainer();
  const gpx = fakeGpxContainer(GPX_BLOBS);
  const images = fakeImagesContainer(IMAGE_BLOBS);
  const run = () =>
    deleteAccount(
      {},
      {
        authenticate,
        usersContainer: () => users,
        toursContainer: () => tours,
        deletionsContainer: () => deletions,
        gpxContainer: async () => gpx,
        imagesContainer: async () => images,
        now: fixedClock,
      },
    );
  return { users, tours, deletions, gpx, images, run };
}

describe('DELETE /api/account', () => {
  it('deletes every document and blob of the caller and returns 204', async () => {
    const { users, tours, gpx, images, run } = setUp();

    const response = await run();

    expect(response.status).toBe(204);
    expect(users.stored('u1', 'u1')).toBeUndefined();
    expect(tours.all().filter((tour) => tour.userId === 'u1')).toEqual([]);
    expect(gpx.names().filter((name) => name.startsWith('u1/'))).toEqual([]);
    expect(images.names().filter((name) => name.startsWith('u1/'))).toEqual([]);
  });

  it("leaves every other user's documents and blobs alone, even under a similar prefix", async () => {
    const { users, tours, gpx, images, run } = setUp();

    await run();

    expect(users.all().map((user) => user.id)).toEqual(['u2', 'u1x']);
    expect(tours.all().map((tour) => tour.id)).toEqual(['t3', 't4']);
    expect(gpx.names()).toEqual(['u1x/t4.gpx', 'u2/t3.gpx']);
    expect(images.names()).toEqual(['u1x/t4/r.jpg', 'u2/t3/q.jpg']);
  });

  it("lists the tours from the token user's partition only", async () => {
    const { tours, run } = setUp();

    await run();

    const [query] = tours.calls.filter((call) => call.operation === 'query');
    expect(query.options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
    const deletes = tours.calls.filter((call) => call.operation === 'delete');
    expect(deletes.map((call) => call.partitionKey)).toEqual(['u1', 'u1']);
  });

  it('deletes a large account at most ten documents at once', async () => {
    const { tours, run } = setUp();
    const load = { inFlight: 0, peak: 0 };
    for (let index = 0; index < 30; index += 1) {
      tours.seed(tourOf('u1', `bulk-${index}`));
      tours.beforeNext('delete', async () => {
        load.inFlight += 1;
        load.peak = Math.max(load.peak, load.inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        load.inFlight -= 1;
      });
    }

    await run();

    expect(tours.all().filter((tour) => tour.userId === 'u1')).toEqual([]);
    expect(load.peak).toBe(10);
  });

  it('deletes every document before any blob', async () => {
    const { users, gpx, images, run } = setUp();
    let blobsWhenUserDeleted = [];
    users.beforeNext('delete', () => {
      blobsWhenUserDeleted = [...gpx.names(), ...images.names()];
    });

    await run();

    expect(blobsWhenUserDeleted).toEqual(expect.arrayContaining([...GPX_BLOBS, ...IMAGE_BLOBS]));
  });

  it('deletes no blob when a document delete fails', async () => {
    const { tours, gpx, images, run } = setUp();
    tours.failOn('delete', { error: cosmosError(503, 'cosmos down') });

    await expect(run()).rejects.toThrow('Some documents of the account were not deleted');

    expect(gpx.names()).toEqual([...GPX_BLOBS].sort());
    expect(images.names()).toEqual([...IMAGE_BLOBS].sort());
  });

  it('surfaces a blob delete failure after trying every blob', async () => {
    const { gpx, images, run } = setUp();
    gpx.failOn('delete', { error: new Error('storage down'), blobName: 'u1/t1.gpx' });

    await expect(run()).rejects.toThrow(
      'The documents of the account are gone, but some of its blobs were not deleted',
    );

    expect(gpx.names()).toEqual(['u1/t1.gpx', 'u1x/t4.gpx', 'u2/t3.gpx']);
    expect(images.names()).toEqual(['u1x/t4/r.jpg', 'u2/t3/q.jpg']);
  });

  it('succeeds when called again, with nothing left to delete', async () => {
    const { run } = setUp();

    await run();
    const second = await run();

    expect(second.status).toBe(204);
  });

  it('queues the Entra object id for the out-of-band deletion job', async () => {
    const { deletions, run } = setUp({ authenticate: signedInAs('u1', { userOid: 'oid-1' }) });

    await run();

    expect(deletions.all()).toEqual([
      expect.objectContaining({ id: 'oid-1', userId: 'u1', requestedAt: NOW.toISOString() }),
    ]);
  });

  it('queues the deletion before deleting any data', async () => {
    const { deletions, tours, run } = setUp({
      authenticate: signedInAs('u1', { userOid: 'oid-1' }),
    });
    tours.failOn('query', { error: cosmosError(503, 'cosmos down') });

    await expect(run()).rejects.toThrow('cosmos down');

    expect(deletions.all().map((queued) => queued.id)).toEqual(['oid-1']);
  });

  it('queues nothing for a caller without an Entra object id (dev bypass)', async () => {
    const { deletions, run } = setUp();

    await run();

    expect(deletions.all()).toEqual([]);
  });

  it('returns 401 without reading or deleting anything when the caller is not signed in', async () => {
    const { users, tours, deletions, gpx, images, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect([
      ...users.calls,
      ...tours.calls,
      ...deletions.calls,
      ...gpx.calls,
      ...images.calls,
    ]).toEqual([]);
  });
});
