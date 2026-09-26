'use strict';

const { deleteTour } = require('./index');
const {
  fakeToursContainer,
  fakeTracksContainer,
  cosmosError,
} = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer, fakeGpxContainer } = require('../../test/fakes/blobContainer');
const { signedInAs, signedOut } = require('../../test/fakes/collaborators');
const { withFailureResponse } = require('../lib/failureResponse');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const SIBLING_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TOUR_ID = '99999999-9999-4999-8999-999999999999';

const TOUR = {
  id: TOUR_ID,
  userId: 'u1',
  name: 'Alps',
  images: [{ id: 'img1', blobName: `u1/${TOUR_ID}/img1.jpg` }, { id: 'img2' }],
};
const SIBLING = { id: SIBLING_ID, userId: 'u1', name: 'Kept', images: [{ id: 'img3' }] };
const OTHER_USERS_TOUR = { id: OTHER_TOUR_ID, userId: 'u2', name: 'Not yours', images: [] };

const TOUR_BLOBS = {
  gpx: [`u1/${TOUR_ID}.gpx`],
  images: [
    `u1/${TOUR_ID}/img1.jpg`,
    `u1/${TOUR_ID}/img1_thumb.jpg`,
    `u1/${TOUR_ID}/img2.jpg`,
    `u1/${TOUR_ID}/img2_thumb.jpg`,
  ],
};
const SURVIVING_BLOBS = {
  gpx: [`u1/${SIBLING_ID}.gpx`, `u2/${OTHER_TOUR_ID}.gpx`, `u2/${TOUR_ID}.gpx`],
  images: [
    `u1/${SIBLING_ID}/img3.jpg`,
    `u1/${SIBLING_ID}/img3_thumb.jpg`,
    `u2/${TOUR_ID}/img1.jpg`,
    `u2/${TOUR_ID}/img1_thumb.jpg`,
  ],
};

function setUp({ authenticate = signedInAs('u1') } = {}) {
  const tours = fakeToursContainer([TOUR, SIBLING, OTHER_USERS_TOUR]);
  const tracks = fakeTracksContainer(
    [TOUR, SIBLING, OTHER_USERS_TOUR].map(({ id, userId }) => ({ id, userId, heatmapData: [] })),
  );
  const gpx = fakeGpxContainer([...TOUR_BLOBS.gpx, ...SURVIVING_BLOBS.gpx]);
  const images = fakeImagesContainer([...TOUR_BLOBS.images, ...SURVIVING_BLOBS.images]);
  const run = (tourId) =>
    deleteTour(
      { params: { tourId } },
      {
        authenticate,
        toursContainer: () => tours,
        tracksContainer: () => tracks,
        gpxContainer: async () => gpx,
        imagesContainer: async () => images,
      },
    );
  return { tours, tracks, gpx, images, run };
}

describe('DELETE /api/tours/{tourId}', () => {
  it('deletes the document, its track, its GPX and every photo with its thumbnail, and returns 204', async () => {
    const { tours, tracks, gpx, images, run } = setUp();

    const response = await run(TOUR_ID);

    expect(response.status).toBe(204);
    expect(tours.stored(TOUR_ID, 'u1')).toBeUndefined();
    expect(tracks.stored(TOUR_ID, 'u1')).toBeUndefined();
    expect(gpx.names()).toEqual([...SURVIVING_BLOBS.gpx].sort());
    expect(images.names()).toEqual([...SURVIVING_BLOBS.images].sort());
  });

  // Document first: a throttled delete leaves the tour whole, blobs included, for a retry.
  it('keeps the tour and its blobs and answers 503 when Cosmos throttles the delete', async () => {
    const { tours, gpx, images, run } = setUp();
    tours.failOn('delete', { error: cosmosError(429, 'Request rate is large') });
    const context = { invocationId: 'invocation-1', error: vi.fn() };

    const response = await withFailureResponse(() => run(TOUR_ID))({}, context);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toStrictEqual({ error: 'errors.busy', invocationId: 'invocation-1' });
    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({ name: 'Alps' });
    expect(gpx.names()).toContain(TOUR_BLOBS.gpx[0]);
    expect(images.names()).toEqual(expect.arrayContaining(TOUR_BLOBS.images));
  });

  it("leaves the caller's other tours and every other user's data alone", async () => {
    const { tours, tracks, run } = setUp();

    await run(TOUR_ID);

    expect(tours.stored(SIBLING_ID, 'u1')).toMatchObject({ name: 'Kept' });
    expect(tours.stored(OTHER_TOUR_ID, 'u2')).toMatchObject({ name: 'Not yours' });
    expect(tracks.all().map((track) => track.id)).toEqual([SIBLING_ID, OTHER_TOUR_ID]);
  });

  it('deletes the document before its track or any blob', async () => {
    const { tours, tracks, gpx, images, run } = setUp();
    let leftWhenDocumentDeleted = [];
    tours.beforeNext('delete', () => {
      leftWhenDocumentDeleted = [
        ...tracks.all().map((track) => track.id),
        ...gpx.names(),
        ...images.names(),
      ];
    });

    await run(TOUR_ID);

    expect(leftWhenDocumentDeleted).toEqual(
      expect.arrayContaining([TOUR_ID, ...TOUR_BLOBS.gpx, ...TOUR_BLOBS.images]),
    );
  });

  it('deletes no track and no blob when the document delete fails', async () => {
    const { tours, tracks, gpx, images, run } = setUp();
    tours.failOn('delete', { error: cosmosError(503, 'cosmos down') });

    await expect(run(TOUR_ID)).rejects.toThrow('cosmos down');

    expect(tracks.stored(TOUR_ID, 'u1')).toBeDefined();

    expect(gpx.names()).toContain(`u1/${TOUR_ID}.gpx`);
    expect(images.names()).toEqual([...TOUR_BLOBS.images, ...SURVIVING_BLOBS.images].sort());
  });

  it('surfaces a blob delete failure after the document is gone, having tried every blob', async () => {
    const { tours, gpx, images, run } = setUp();
    gpx.failOn('delete', { error: new Error('storage down') });

    const error = await run(TOUR_ID).catch((failure) => failure);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe(
      `Tour ${TOUR_ID} was deleted, but its track or some of its blobs were not`,
    );
    expect(error.errors.map((failure) => failure.message)).toEqual(['storage down']);
    expect(tours.stored(TOUR_ID, 'u1')).toBeUndefined();
    expect(images.names()).toEqual([...SURVIVING_BLOBS.images].sort());
  });

  it('succeeds when its track or some of its blobs are already gone', async () => {
    const { tracks, gpx, images, run } = setUp();
    await tracks.item(TOUR_ID, 'u1').delete();
    await gpx.getBlockBlobClient(`u1/${TOUR_ID}.gpx`).deleteIfExists();
    await images.getBlockBlobClient(`u1/${TOUR_ID}/img2_thumb.jpg`).deleteIfExists();

    const response = await run(TOUR_ID);

    expect(response.status).toBe(204);
    expect(images.names()).toEqual([...SURVIVING_BLOBS.images].sort());
  });

  it("returns 404 for another user's tour that exists, deleting nothing", async () => {
    const { tours, tracks, gpx, images, run } = setUp();

    const response = await run(OTHER_TOUR_ID);

    expect(response.status).toBe(404);
    expect(tours.stored(OTHER_TOUR_ID, 'u2')).toBeDefined();
    expect(tours.calls).toEqual([{ operation: 'read', id: OTHER_TOUR_ID, partitionKey: 'u1' }]);
    expect([...tracks.calls, ...gpx.calls, ...images.calls]).toEqual([]);
  });

  it('re-throws read errors other than 404', async () => {
    const { tours, run } = setUp();
    tours.failOn('read', { error: cosmosError(503, 'boom') });

    await expect(run(TOUR_ID)).rejects.toThrow('boom');
  });

  it('returns 400 before any read when tourId is not a UUID', async () => {
    const { tours, run } = setUp();

    const response = await run('bad');

    expect(response.status).toBe(400);
    expect(tours.calls).toEqual([]);
  });

  it('returns 401 without reading or deleting when the caller is not signed in', async () => {
    const { tours, gpx, images, run } = setUp({ authenticate: signedOut });

    const response = await run(TOUR_ID);

    expect(response.status).toBe(401);
    expect([...tours.calls, ...gpx.calls, ...images.calls]).toEqual([]);
  });
});
