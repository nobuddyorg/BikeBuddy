'use strict';

// Two riders, each with a tour and a photo: neither reaches, changes or sees the other's.

const { randomUUID } = require('node:crypto');
const { connectHarness } = require('./harness');
const { TOUR_SCOPED_ENDPOINTS, named } = require('./endpoints');
const { blobNameOf, mapUrlsOf, ownerView, signedUrlsOf } = require('./views');
const { geotaggedJpeg } = require('../fixtures/jpegs');

let alice;
let bob;
let jpeg;

async function seed(user) {
  const tourId = await user.api.createTour({ name: `Isolation ${randomUUID()}` });
  const image = await user.api.addPhoto({ tourId, jpeg });
  return { tourId, imageId: image.id, jpeg };
}

beforeAll(async () => {
  const harness = await connectHarness();
  alice = harness.newUser();
  bob = harness.newUser();
  jpeg = await geotaggedJpeg();
  alice.target = await seed(alice);
  bob.target = await seed(bob);
  alice.before = await ownerView(alice.api, alice.target);
  bob.before = await ownerView(bob.api, bob.target);
}, 60_000);

afterAll(async () => {
  await Promise.all([alice?.api.deleteAccount(), bob?.api.deleteAccount()]);
});

const idsOf = (tours) => tours.map((tour) => tour.id);

describe("another rider's tour, by its known id", () => {
  test.each(named(TOUR_SCOPED_ENDPOINTS))(
    '%s answers 404, exactly as for an id that does not exist',
    async (_name, endpoint) => {
      const nowhere = { tourId: randomUUID(), imageId: randomUUID(), jpeg };

      const foreign = await endpoint.send(bob.api, alice.target);
      const missing = await endpoint.send(bob.api, nowhere);

      expect(foreign.status).toBe(404);
      expect({ status: foreign.status, body: await foreign.json() }).toEqual({
        status: missing.status,
        body: await missing.json(),
      });
      // Still there, and untouched: a 404 for a deleted tour would prove nothing.
      expect(await ownerView(alice.api, alice.target)).toEqual(alice.before);
    },
  );

  test("DELETE of alice's photo through bob's own tour answers 404 and deletes nothing", async () => {
    const response = await bob.api.request(
      `/tours/${bob.target.tourId}/images/${alice.target.imageId}`,
      { method: 'DELETE' },
    );

    expect(response.status).toBe(404);
    expect(await ownerView(alice.api, alice.target)).toEqual(alice.before);
    expect(await ownerView(bob.api, bob.target)).toEqual(bob.before);
  });

  test.each(named(TOUR_SCOPED_ENDPOINTS))(
    '%s answers 400 for a malformed id, before any read',
    async (_name, endpoint) => {
      const malformed = { tourId: 'not-a-uuid', imageId: 'not-a-uuid', jpeg };
      expect((await endpoint.send(bob.api, malformed)).status).toBe(400);
    },
  );
});

describe('what each rider can see', () => {
  test.each([
    ['alice', () => [alice, bob]],
    ['bob', () => [bob, alice]],
  ])("%s's list, map and export hold only their own tour", async (_name, riders) => {
    const [self, other] = riders();
    const [tours, map, exported] = await Promise.all([
      self.api.readJson('/tours'),
      self.api.readJson('/map'),
      self.api.readJson('/me/export'),
    ]);

    expect(idsOf(tours)).toEqual([self.target.tourId]);
    expect(idsOf(map)).toEqual([self.target.tourId]);
    expect(idsOf(exported.tours)).toEqual([self.target.tourId]);
    expect(exported.user.id).toBe(self.userId);
    const everything = JSON.stringify({ tours, map, exported });
    for (const foreignId of [other.userId, other.target.tourId, other.target.imageId]) {
      expect(everything).not.toContain(foreignId);
    }
  });

  test.each([
    ['alice', () => alice],
    ['bob', () => bob],
  ])('every signed URL %s is handed names a blob under their own prefix', async (_name, rider) => {
    const self = rider();
    const [detail, map] = await Promise.all([
      self.api.readJson(`/tours/${self.target.tourId}`),
      self.api.readJson('/map'),
    ]);
    const uploaded = await self.api.addPhoto({ tourId: self.target.tourId, jpeg });
    try {
      const urls = [...signedUrlsOf(detail), ...mapUrlsOf(map), uploaded.url, uploaded.thumbUrl];

      expect(urls).toHaveLength(7);
      for (const url of urls) expect(blobNameOf(url).split('/')[0]).toBe(self.userId);
    } finally {
      const removed = await self.api.request(`/tours/${self.target.tourId}/images/${uploaded.id}`, {
        method: 'DELETE',
      });
      expect(removed.status).toBe(204);
    }
  });

  test("bob renaming himself leaves alice's profile as it was", async () => {
    const renamed = await bob.api.sendJson('/me', {
      method: 'PATCH',
      body: { name: `Bob ${randomUUID()}` },
    });

    expect(renamed.status).toBe(200);
    expect((await alice.api.readJson('/me')).name).toBe(alice.before.profile.name);
  });
});
