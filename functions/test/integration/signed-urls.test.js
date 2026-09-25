'use strict';

// Every URL the API hands out reads exactly one blob under the caller's prefix (#620).

const { randomUUID } = require('node:crypto');
const { SAMPLE_GPX } = require('./api');
const { connectHarness } = require('./harness');
const { blobNameOf, signedUrlsOf, statusOf } = require('./views');
const { geotaggedJpeg } = require('../fixtures/jpegs');

let rider;
let stranger;
let jpeg;

async function createTourWithPhoto(user) {
  const tourId = await user.api.createTour({ name: `Signed URLs ${randomUUID()}` });
  await user.api.addPhoto({ tourId, jpeg });
  return user.api.readJson(`/tours/${tourId}`);
}

beforeAll(async () => {
  const harness = await connectHarness();
  rider = harness.newUser();
  stranger = harness.newUser();
  jpeg = await geotaggedJpeg();
  rider.tour = await createTourWithPhoto(rider);
  stranger.tour = await createTourWithPhoto(stranger);
}, 60_000);

afterAll(async () => {
  await Promise.all([rider?.api.deleteAccount(), stranger?.api.deleteAccount()]);
});

describe('signed blob URLs', () => {
  it("names only blobs under the caller's own prefix", () => {
    const { tour, userId } = rider;
    const urls = signedUrlsOf(tour);

    expect(urls).toHaveLength(3);
    for (const url of urls) expect(blobNameOf(url).split('/')[0]).toBe(userId);
    expect(blobNameOf(tour.gpxFileUrl)).toBe(`${userId}/${tour.id}.gpx`);
  });

  it('reads the blob it names', async () => {
    const gpx = await fetch(rider.tour.gpxFileUrl);
    const photo = await fetch(rider.tour.images[0].url);

    expect(gpx.status).toBe(200);
    expect(await gpx.text()).toBe(SAMPLE_GPX);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
  });

  it('refuses a write to the blob it names', async () => {
    const response = await fetch(rider.tour.gpxFileUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/gpx+xml' },
      body: '<gpx/>',
    });

    expect(response.status).toBe(403);
    expect(await (await fetch(rider.tour.gpxFileUrl)).text()).toBe(SAMPLE_GPX);
  });

  it('refuses to read a sibling blob with the same signature', async () => {
    const photo = new URL(rider.tour.images[0].url);
    photo.pathname = new URL(rider.tour.images[0].thumbUrl).pathname;

    expect((await fetch(photo)).status).toBe(403);
  });

  it("refuses to read another user's blob with the caller's signature", async () => {
    const photo = new URL(rider.tour.images[0].url);
    photo.pathname = new URL(stranger.tour.images[0].url).pathname;

    expect((await fetch(photo)).status).toBe(403);
    expect(await statusOf(stranger.tour.images[0].url)).toBe(200);
  });

  it('stops reading once the tour is deleted: its GPX, photos and thumbnails are gone (#553)', async () => {
    const doomed = await createTourWithPhoto(rider);
    const urls = signedUrlsOf(doomed);
    for (const url of urls) expect(await statusOf(url)).toBe(200);

    const deleted = await rider.api.request(`/tours/${doomed.id}`, { method: 'DELETE' });

    expect(deleted.status).toBe(204);
    for (const url of urls) expect(await statusOf(url)).toBe(404);
  }, 60_000);
});
