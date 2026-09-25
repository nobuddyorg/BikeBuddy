'use strict';

const { getTour } = require('./index');
const { fakeToursContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer, fakeGpxContainer } = require('../../test/fakes/blobContainer');
const {
  signedInAs,
  signedOut,
  fixedClock,
  NOW,
  signedUrlParts,
} = require('../../test/fakes/collaborators');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TOUR_ID = '99999999-9999-4999-8999-999999999999';
const ONE_HOUR_LATER = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();

const TOUR = {
  id: TOUR_ID,
  userId: 'u1',
  name: 'Alps',
  description: 'Nice ride',
  distance: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  images: [
    { id: 'img1', blobName: `u1/${TOUR_ID}/img1.jpg`, lat: 48.1, lon: 11.5 },
    { id: 'img2', blobName: `u1/${TOUR_ID}/img2.jpg` },
  ],
  gpxFileUrl: `https://account.blob.core.windows.net/gpx-files/u1/${TOUR_ID}.gpx`,
  elevationGain: 340,
};
const OTHER_USERS_TOUR = { ...TOUR, id: OTHER_TOUR_ID, userId: 'u2', name: 'Not yours' };

function setUp({ documents = [TOUR, OTHER_USERS_TOUR], authenticate = signedInAs('u1') } = {}) {
  const tours = fakeToursContainer(documents);
  const images = fakeImagesContainer();
  const gpx = fakeGpxContainer();
  const run = (tourId, request = {}) =>
    getTour(
      { params: { tourId }, ...request },
      {
        authenticate,
        toursContainer: () => tours,
        imagesContainer: async () => images,
        gpxContainer: async () => gpx,
        now: fixedClock,
      },
    );
  return { tours, images, gpx, run };
}

describe('GET /api/tours/{tourId}', () => {
  it('returns the tour with its track and stats, and no storage fields', async () => {
    const { run } = setUp();

    const response = await run(TOUR_ID);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      id: TOUR_ID,
      name: 'Alps',
      description: 'Nice ride',
      distance: 120,
      createdAt: TOUR.createdAt,
      heatmapData: TOUR.heatmapData,
      elevationGain: 340,
      elevationLoss: null,
    });
    for (const key of ['userId', '_rid', '_self', '_etag', '_ts']) {
      expect(response.jsonBody).not.toHaveProperty(key);
    }
    expect(JSON.stringify(response.jsonBody)).not.toContain('blobName');
    expect(JSON.stringify(response.jsonBody)).not.toContain('blob.core.windows.net');
  });

  it("replaces every image with signed full and thumbnail URLs under the caller's prefix", async () => {
    const { run } = setUp();

    const { images } = (await run(TOUR_ID)).jsonBody;

    expect(images).toStrictEqual([
      { id: 'img1', url: expect.any(String), thumbUrl: expect.any(String), lat: 48.1, lon: 11.5 },
      { id: 'img2', url: expect.any(String), thumbUrl: expect.any(String) },
    ]);
    expect(signedUrlParts(images[0].url)).toMatchObject({
      path: `/tour-images/u1/${TOUR_ID}/img1.jpg`,
      permissions: 'r',
      resource: 'b',
      expiresOn: ONE_HOUR_LATER,
    });
    expect(signedUrlParts(images[1].thumbUrl).path).toBe(
      `/tour-images/u1/${TOUR_ID}/img2_thumb.jpg`,
    );
  });

  it('signs a read-only, one-hour GPX download named after the tour', async () => {
    const { run } = setUp();

    const { gpxFileUrl } = (await run(TOUR_ID)).jsonBody;

    expect(signedUrlParts(gpxFileUrl)).toEqual({
      path: `/gpx-files/u1/${TOUR_ID}.gpx`,
      permissions: 'r',
      resource: 'b',
      expiresOn: ONE_HOUR_LATER,
      contentDisposition: 'attachment; filename="Alps.gpx"',
    });
  });

  it('signs the GPX of the token user even when the stored document names another', async () => {
    const tampered = { ...TOUR, gpxFileUrl: `https://account/gpx-files/u2/${TOUR_ID}.gpx` };
    const { run } = setUp({ documents: [tampered] });

    const { gpxFileUrl, images } = (await run(TOUR_ID)).jsonBody;

    expect(signedUrlParts(gpxFileUrl).path).toBe(`/gpx-files/u1/${TOUR_ID}.gpx`);
    for (const image of images)
      expect(signedUrlParts(image.url).path).toMatch(/^\/tour-images\/u1\//);
  });

  it('offers no GPX download and no images for a tour stored without them', async () => {
    const { images, gpx, run } = setUp({
      documents: [{ ...TOUR, images: undefined, gpxFileUrl: undefined }],
    });

    const response = await run(TOUR_ID);

    expect(response.jsonBody.images).toEqual([]);
    expect(response.jsonBody).not.toHaveProperty('gpxFileUrl');
    expect(images.calls).toEqual([]);
    expect(gpx.calls).toEqual([]);
  });

  it("reads the tour from the token user's partition only", async () => {
    const { tours, run } = setUp();

    await run(TOUR_ID, { query: new URLSearchParams({ userId: 'u2' }) });

    expect(tours.calls).toEqual([{ operation: 'read', id: TOUR_ID, partitionKey: 'u1' }]);
  });

  it("returns 404 for another user's tour that exists, and signs nothing", async () => {
    const { images, gpx, run } = setUp();

    const response = await run(OTHER_TOUR_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('errors.tourNotFound');
    expect([...images.calls, ...gpx.calls]).toEqual([]);
  });

  it('returns 404 when the read throws a 404, as real Cosmos does', async () => {
    const { tours, run } = setUp();
    tours.failOn('read', { error: cosmosError(404, 'Not found') });

    expect((await run(TOUR_ID)).status).toBe(404);
  });

  it('re-throws other read errors', async () => {
    const { tours, run } = setUp();
    tours.failOn('read', { error: cosmosError(503, 'boom') });

    await expect(run(TOUR_ID)).rejects.toThrow('boom');
  });

  it('returns 400 before any read when tourId is not a UUID', async () => {
    const { tours, run } = setUp();

    const response = await run('not-a-uuid');

    expect(response.status).toBe(400);
    expect(tours.calls).toEqual([]);
  });

  it('returns 401 without reading anything when the caller is not signed in', async () => {
    const { tours, images, gpx, run } = setUp({ authenticate: signedOut });

    const response = await run(TOUR_ID);

    expect(response.status).toBe(401);
    expect([...tours.calls, ...images.calls, ...gpx.calls]).toEqual([]);
  });
});
