'use strict';

const { exportData } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { fakeToursContainer, fakeUsersContainer } = require('../../test/fakes/cosmosContainer');
const { signedInAs, signedOut, fixedClock, NOW } = require('../../test/fakes/collaborators');

const PROFILE = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  language: 'de',
};
const TOUR = {
  id: 't1',
  userId: 'u1',
  name: 'Alps',
  heatmapData: [[48.1, 11.5]],
  images: [{ id: 'i1', blobName: 'u1/t1/i1.jpg', lat: 48.1, lon: 11.5 }],
};
const OTHER_USERS_TOUR = { id: 't9', userId: 'u2', name: 'Not yours' };

function setUp({
  profiles = [PROFILE, { id: 'u2', name: 'Grace' }],
  authenticate = signedInAs('u1'),
} = {}) {
  const users = fakeUsersContainer(profiles);
  const tours = fakeToursContainer([TOUR, OTHER_USERS_TOUR]);
  const run = () =>
    exportData(
      {},
      { authenticate, usersContainer: () => users, toursContainer: () => tours, now: fixedClock },
    );
  return { users, tours, run };
}

describe('GET /api/me/export', () => {
  it("exports the caller's profile and every tour as stored, as a JSON download", async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.headers['Content-Disposition']).toBe(
      'attachment; filename="bikebuddy-export.json"',
    );
    expect(response.jsonBody).toStrictEqual({
      exportedAt: NOW.toISOString(),
      user: PROFILE,
      tours: [TOUR],
    });
  });

  it('leaves out the system properties Cosmos adds to every document', async () => {
    const { run } = setUp();

    const { user, tours } = (await run()).jsonBody;

    for (const document of [user, ...tours]) {
      for (const key of ['_rid', '_self', '_etag', '_attachments', '_ts']) {
        expect(document).not.toHaveProperty(key);
      }
    }
  });

  it("reads only the token user's profile and partition", async () => {
    const { users, tours, run } = setUp();

    await run();

    expect(users.calls).toEqual([{ operation: 'read', id: 'u1', partitionKey: 'u1' }]);
    const [query] = tours.calls;
    expect(query.options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
  });

  it("never includes another user's data", async () => {
    const { run } = setUp({ authenticate: signedInAs('u2') });

    const { user, tours } = (await run()).jsonBody;

    expect(user).toEqual({ id: 'u2', name: 'Grace' });
    expect(tours.map((tour) => tour.id)).toEqual(['t9']);
  });

  it('exports user: null when the profile does not exist yet', async () => {
    const { run } = setUp({ profiles: [] });

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody.user).toBeNull();
  });

  it('returns 401 without reading anything when the caller is not signed in', async () => {
    const { users, tours, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect([...users.calls, ...tours.calls]).toEqual([]);
  });
});
