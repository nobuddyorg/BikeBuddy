'use strict';

const { exportData } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { fakeToursContainer, fakeUsersContainer } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer, fakeGpxContainer } = require('../../test/fakes/blobContainer');
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
  gpxFileUrl: 'https://fake.blob/gpx-files/u1/t1.gpx',
  images: [{ id: 'i1', blobName: 'u1/t1/i1.jpg', lat: 48.1, lon: 11.5 }],
};
// The SAS window's end: the close of the hour after the one NOW falls in.
const LINKS_EXPIRE_AT = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
const signedUrlParts = (url) => {
  const parsed = new URL(url);
  return { path: parsed.pathname, ...Object.fromEntries(parsed.searchParams) };
};
const OTHER_USERS_TOUR = { id: 't9', userId: 'u2', name: 'Not yours' };

function setUp({
  profiles = [PROFILE, { id: 'u2', name: 'Grace' }],
  authenticate = signedInAs('u1'),
} = {}) {
  const users = fakeUsersContainer(profiles);
  const tours = fakeToursContainer([TOUR, OTHER_USERS_TOUR]);
  const gpx = fakeGpxContainer();
  const images = fakeImagesContainer();
  const run = () =>
    exportData(
      {},
      {
        authenticate,
        usersContainer: () => users,
        toursContainer: () => tours,
        gpxContainer: async () => gpx,
        imagesContainer: async () => images,
        now: fixedClock,
      },
    );
  return { users, tours, gpx, images, run };
}

describe('GET /api/me/export', () => {
  it("exports the caller's profile and every tour with links to its files, as a JSON download", async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.headers['Content-Disposition']).toBe(
      'attachment; filename="bikebuddy-export.json"',
    );
    expect(response.jsonBody).toStrictEqual({
      exportedAt: NOW.toISOString(),
      linksExpireAt: LINKS_EXPIRE_AT,
      user: PROFILE,
      tours: [
        {
          id: 't1',
          userId: 'u1',
          name: 'Alps',
          heatmapData: [[48.1, 11.5]],
          gpxFileUrl: expect.any(String),
          images: [{ id: 'i1', lat: 48.1, lon: 11.5, url: expect.any(String) }],
        },
      ],
    });
  });

  it('links the GPX file and each photo read-only for an hour, the GPX named after the tour (#540)', async () => {
    const { run } = setUp();

    const [tour] = (await run()).jsonBody.tours;

    expect(signedUrlParts(tour.gpxFileUrl)).toStrictEqual({
      path: '/gpx-files/u1/t1.gpx',
      sp: 'r',
      sr: 'b',
      se: LINKS_EXPIRE_AT,
      rscd: 'attachment; filename="Alps.gpx"',
    });
    expect(signedUrlParts(tour.images[0].url)).toStrictEqual({
      path: '/tour-images/u1/t1/i1.jpg',
      sp: 'r',
      sr: 'b',
      se: LINKS_EXPIRE_AT,
    });
  });

  it('names the blobs from the token user, never from the stored references', async () => {
    const tampered = {
      ...TOUR,
      gpxFileUrl: 'https://fake.blob/gpx-files/u2/t9.gpx',
      images: [{ id: 'i1', blobName: 'u2/t9/i9.jpg' }],
    };
    const tours = fakeToursContainer([tampered]);
    const gpx = fakeGpxContainer();
    const images = fakeImagesContainer();

    const response = await exportData(
      {},
      {
        authenticate: signedInAs('u1'),
        usersContainer: () => fakeUsersContainer([]),
        toursContainer: () => tours,
        gpxContainer: async () => gpx,
        imagesContainer: async () => images,
        now: fixedClock,
      },
    );

    expect([...gpx.calls, ...images.calls]).toEqual([
      { operation: 'sign', blobName: 'u1/t1.gpx' },
      { operation: 'sign', blobName: 'u1/t1/i1.jpg' },
    ]);
    expect(JSON.stringify(response.jsonBody)).not.toContain('u2/');
  });

  it('signs nothing for a tour stored without a GPX file or photos', async () => {
    const tours = fakeToursContainer([{ id: 't3', userId: 'u1', name: 'Seeded' }]);
    const gpx = fakeGpxContainer();
    const images = fakeImagesContainer();

    const response = await exportData(
      {},
      {
        authenticate: signedInAs('u1'),
        usersContainer: () => fakeUsersContainer([]),
        toursContainer: () => tours,
        gpxContainer: async () => gpx,
        imagesContainer: async () => images,
        now: fixedClock,
      },
    );

    expect(response.jsonBody.tours).toStrictEqual([
      { id: 't3', userId: 'u1', name: 'Seeded', images: [] },
    ]);
    expect([...gpx.calls, ...images.calls]).toEqual([]);
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
    const { users, tours, gpx, images, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect([...users.calls, ...tours.calls, ...gpx.calls, ...images.calls]).toEqual([]);
  });
});
