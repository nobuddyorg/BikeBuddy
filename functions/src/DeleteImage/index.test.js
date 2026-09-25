'use strict';

const { deleteImage } = require('./index');
const { fakeToursContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer } = require('../../test/fakes/blobContainer');
const { signedInAs, signedOut } = require('../../test/fakes/collaborators');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TOUR_ID = '99999999-9999-4999-8999-999999999999';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const KEPT_IMAGE_ID = '33333333-3333-4333-8333-333333333333';
const UNKNOWN_IMAGE_ID = '44444444-4444-4444-8444-444444444444';

const image = (userId, tourId, imageId) => ({
  id: imageId,
  blobName: `${userId}/${tourId}/${imageId}.jpg`,
});
const TOUR = {
  id: TOUR_ID,
  userId: 'u1',
  name: 'Alps',
  images: [image('u1', TOUR_ID, IMAGE_ID), image('u1', TOUR_ID, KEPT_IMAGE_ID)],
};
const OTHER_USERS_TOUR = {
  id: OTHER_TOUR_ID,
  userId: 'u2',
  name: 'Not yours',
  images: [image('u2', OTHER_TOUR_ID, IMAGE_ID)],
};
const blobsOf = (userId, tourId, imageId) => [
  `${userId}/${tourId}/${imageId}.jpg`,
  `${userId}/${tourId}/${imageId}_thumb.jpg`,
];
const DELETED_BLOBS = blobsOf('u1', TOUR_ID, IMAGE_ID);
const SURVIVING_BLOBS = [
  ...blobsOf('u1', TOUR_ID, KEPT_IMAGE_ID),
  ...blobsOf('u2', OTHER_TOUR_ID, IMAGE_ID),
  ...blobsOf('u2', TOUR_ID, IMAGE_ID),
].sort();

function setUp({ documents = [TOUR, OTHER_USERS_TOUR], authenticate = signedInAs('u1') } = {}) {
  const tours = fakeToursContainer(documents);
  const images = fakeImagesContainer([...DELETED_BLOBS, ...SURVIVING_BLOBS]);
  const run = (tourId, imageId) =>
    deleteImage(
      { params: { tourId, imageId } },
      { authenticate, toursContainer: () => tours, imagesContainer: async () => images },
    );
  const imageIdsOf = (tourId, userId) => tours.stored(tourId, userId).images.map(({ id }) => id);
  const replaces = () => tours.calls.filter((call) => call.operation === 'replace');
  return { tours, images, run, imageIdsOf, replaces };
}

const conflict = () => cosmosError(412, 'Precondition failed');

describe('DELETE /api/tours/{tourId}/images/{imageId}', () => {
  it('removes the entry, then the photo and its thumbnail, and returns 204', async () => {
    const { images, run, imageIdsOf } = setUp();

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(204);
    expect(imageIdsOf(TOUR_ID, 'u1')).toEqual([KEPT_IMAGE_ID]);
    expect(images.names()).toEqual(SURVIVING_BLOBS);
  });

  it("writes to the token user's partition, conditional on the tour as read", async () => {
    const { run, replaces } = setUp();

    await run(TOUR_ID, IMAGE_ID);

    const [replace] = replaces();
    expect(replace.partitionKey).toBe('u1');
    expect(replace.options.accessCondition.type).toBe('IfMatch');
  });

  it('removes the entry before deleting any blob', async () => {
    const { tours, images, run } = setUp();
    let blobsWhenEntryRemoved = [];
    tours.beforeNext('replace', () => {
      blobsWhenEntryRemoved = images.names();
    });

    await run(TOUR_ID, IMAGE_ID);

    expect(blobsWhenEntryRemoved).toEqual(expect.arrayContaining(DELETED_BLOBS));
  });

  it('deletes no blob when the entry removal fails', async () => {
    const { tours, images, run } = setUp();
    tours.failOn('replace', { error: cosmosError(503, 'service unavailable') });

    await expect(run(TOUR_ID, IMAGE_ID)).rejects.toThrow('service unavailable');

    expect(images.names()).toEqual([...DELETED_BLOBS, ...SURVIVING_BLOBS].sort());
  });

  it('does not retry an error other than a conflict', async () => {
    const { tours, run, replaces } = setUp();
    tours.failOn('replace', { error: cosmosError(503, 'service unavailable') });

    await expect(run(TOUR_ID, IMAGE_ID)).rejects.toThrow('service unavailable');

    expect(replaces()).toHaveLength(1);
  });

  it('keeps a photo another request added between the read and the write', async () => {
    const { tours, run, imageIdsOf } = setUp();
    const added = image('u1', TOUR_ID, UNKNOWN_IMAGE_ID);
    tours.beforeNext('replace', () => tours.seed({ ...TOUR, images: [...TOUR.images, added] }));

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(204);
    expect(imageIdsOf(TOUR_ID, 'u1')).toEqual([KEPT_IMAGE_ID, UNKNOWN_IMAGE_ID]);
  });

  it('succeeds on the third attempt after two conflicts', async () => {
    const { tours, run, replaces, imageIdsOf } = setUp();
    tours.failOn('replace', { error: conflict(), times: 2 });

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(204);
    expect(replaces()).toHaveLength(3);
    expect(imageIdsOf(TOUR_ID, 'u1')).toEqual([KEPT_IMAGE_ID]);
  });

  it('gives up after three conflicts, deleting no blob', async () => {
    const { tours, images, run, replaces } = setUp();
    tours.failOn('replace', { error: conflict(), times: 3 });

    await expect(run(TOUR_ID, IMAGE_ID)).rejects.toThrow('Precondition failed');

    expect(replaces()).toHaveLength(3);
    expect(images.names()).toEqual([...DELETED_BLOBS, ...SURVIVING_BLOBS].sort());
  });

  it('returns 404 when the tour was deleted while the entry was being removed', async () => {
    const { tours, images, run } = setUp();
    tours.failOn('replace', { error: conflict() });
    tours.beforeNext('replace', () => tours.item(TOUR_ID, 'u1').delete());

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Tour not found');
    expect(images.names()).toEqual([...DELETED_BLOBS, ...SURVIVING_BLOBS].sort());
  });

  it('surfaces a blob delete failure after the entry is gone', async () => {
    const { images, run, imageIdsOf } = setUp();
    images.failOn('delete', { error: new Error('storage down'), blobName: DELETED_BLOBS[1] });

    await expect(run(TOUR_ID, IMAGE_ID)).rejects.toThrow(
      `Image ${IMAGE_ID} was removed from its tour, but not all of its blobs were deleted`,
    );

    expect(imageIdsOf(TOUR_ID, 'u1')).toEqual([KEPT_IMAGE_ID]);
    expect(images.names()).not.toContain(DELETED_BLOBS[0]);
  });

  it("returns 404 for another user's tour and image that exist, changing nothing", async () => {
    const { tours, images, run, imageIdsOf } = setUp();

    const response = await run(OTHER_TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Tour not found');
    expect(imageIdsOf(OTHER_TOUR_ID, 'u2')).toEqual([IMAGE_ID]);
    expect(tours.calls).toEqual([{ operation: 'read', id: OTHER_TOUR_ID, partitionKey: 'u1' }]);
    expect(images.calls).toEqual([]);
  });

  it('returns 404 for an image id the tour does not have', async () => {
    const { images, run, replaces } = setUp();

    const response = await run(TOUR_ID, UNKNOWN_IMAGE_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Image not found');
    expect(replaces()).toEqual([]);
    expect(images.calls).toEqual([]);
  });

  it('returns 404 for a tour stored without an images field', async () => {
    const { run } = setUp({ documents: [{ ...TOUR, images: undefined }] });

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Image not found');
  });

  it('returns 400 before any read when an id is not a UUID', async () => {
    const { tours, run } = setUp();

    const badImage = await run(TOUR_ID, 'bad');
    const badTour = await run('bad', IMAGE_ID);

    expect(badImage.status).toBe(400);
    expect(badImage.jsonBody.error).toBe('Invalid imageId');
    expect(badTour.jsonBody.error).toBe('Invalid tourId');
    expect(tours.calls).toEqual([]);
  });

  it('returns 401 without reading or deleting when the caller is not signed in', async () => {
    const { tours, images, run } = setUp({ authenticate: signedOut });

    const response = await run(TOUR_ID, IMAGE_ID);

    expect(response.status).toBe(401);
    expect([...tours.calls, ...images.calls]).toEqual([]);
  });
});
