'use strict';

const sharp = require('sharp');
const { uploadImage } = require('./index');
const { fakeToursContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer } = require('../../test/fakes/blobContainer');
const {
  signedInAs,
  signedOut,
  fixedClock,
  NOW,
  idsInOrder,
  signedUrlParts,
} = require('../../test/fakes/collaborators');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TOUR_ID = '99999999-9999-4999-8999-999999999999';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOT_AN_IMAGE = Buffer.from('hello world');
const FULL = Buffer.from('full-bytes');
const THUMBNAIL = Buffer.from('thumbnail-bytes');
const FULL_BLOB = `u1/${TOUR_ID}/${IMAGE_ID}.jpg`;
const THUMBNAIL_BLOB = `u1/${TOUR_ID}/${IMAGE_ID}_thumb.jpg`;
const ONE_HOUR_LATER = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();

const TOUR = { id: TOUR_ID, userId: 'u1', name: 'Alps', images: [] };
const OTHER_USERS_TOUR = { id: OTHER_TOUR_ID, userId: 'u2', name: 'Not yours', images: [] };

const fileOf =
  (buffer, mimeType = 'image/jpeg') =>
  async () => ({
    filename: 'photo.jpg',
    mimeType,
    buffer,
  });
const clientError = (message) => Object.assign(new Error(message), { status: 400 });

function setUp({
  documents = [TOUR, OTHER_USERS_TOUR],
  authenticate = signedInAs('u1'),
  ...overrides
} = {}) {
  const tours = fakeToursContainer(documents);
  const images = fakeImagesContainer();
  const run = (tourId = TOUR_ID, options = {}) =>
    uploadImage(
      { params: { tourId } },
      {
        authenticate,
        toursContainer: () => tours,
        imagesContainer: async () => images,
        parseFile: fileOf(JPEG),
        resize: async () => ({ full: FULL, thumbnail: THUMBNAIL }),
        readGps: async () => null,
        newId: idsInOrder(IMAGE_ID),
        now: fixedClock,
        ...overrides,
        ...options,
      },
    );
  const storedImages = (tourId = TOUR_ID, userId = 'u1') => tours.stored(tourId, userId).images;
  return { tours, images, run, storedImages };
}

describe('POST /api/tours/{tourId}/images', () => {
  it('stores both sizes, appends the entry and returns 201 with signed URLs', async () => {
    const { images, run, storedImages } = setUp();

    const response = await run();

    expect(response.status).toBe(201);
    expect(response.jsonBody).toStrictEqual({
      id: IMAGE_ID,
      url: expect.any(String),
      thumbUrl: expect.any(String),
    });
    expect(images.blob(FULL_BLOB)).toEqual({ data: FULL, contentType: 'image/jpeg' });
    expect(images.blob(THUMBNAIL_BLOB)).toEqual({ data: THUMBNAIL, contentType: 'image/jpeg' });
    expect(storedImages()).toEqual([{ id: IMAGE_ID, blobName: FULL_BLOB }]);
  });

  it("signs read-only, one-hour URLs for the new photo under the caller's prefix", async () => {
    const { run } = setUp();

    const { url, thumbUrl } = (await run()).jsonBody;

    expect(signedUrlParts(url)).toMatchObject({
      path: `/tour-images/${FULL_BLOB}`,
      permissions: 'r',
      resource: 'b',
      expiresOn: ONE_HOUR_LATER,
    });
    expect(signedUrlParts(thumbUrl).path).toBe(`/tour-images/${THUMBNAIL_BLOB}`);
  });

  it('resizes and reads GPS for real when no overrides are given', async () => {
    const photo = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const { images, run } = setUp();

    const response = await run(TOUR_ID, {
      parseFile: fileOf(photo),
      resize: undefined,
      readGps: undefined,
    });

    expect(response.status).toBe(201);
    expect((await sharp(images.blob(FULL_BLOB).data).metadata()).format).toBe('jpeg');
    expect(images.blob(THUMBNAIL_BLOB).contentType).toBe('image/jpeg');
    expect(response.jsonBody).not.toHaveProperty('lat');
  });

  it('keeps a photo another upload appended between the read and the write', async () => {
    const { tours, run, storedImages } = setUp();
    const concurrent = { id: 'concurrent', blobName: `u1/${TOUR_ID}/concurrent.jpg` };
    tours.beforeNext('patch', () => tours.seed({ ...TOUR, images: [concurrent] }));

    await run();

    expect(storedImages().map((entry) => entry.id)).toEqual(['concurrent', IMAGE_ID]);
  });

  it('stores and returns the coordinates of a geotagged photo', async () => {
    const { run, storedImages } = setUp({ readGps: async () => ({ lat: 48.137, lon: 11.575 }) });

    const response = await run();

    expect(response.jsonBody).toMatchObject({ lat: 48.137, lon: 11.575 });
    expect(storedImages()).toEqual([
      { id: IMAGE_ID, blobName: FULL_BLOB, lat: 48.137, lon: 11.575 },
    ]);
  });

  it('accepts a PNG by its magic bytes', async () => {
    const { run } = setUp({ parseFile: fileOf(PNG, 'image/png') });

    expect((await run()).status).toBe(201);
  });

  it.each([
    ['bytes that are not an image', fileOf(NOT_AN_IMAGE)],
    ['a declared type that is not an image', fileOf(JPEG, 'text/plain')],
  ])('rejects %s with 400, storing nothing', async (_label, parseFile) => {
    const { tours, images, run } = setUp({ parseFile });

    const response = await run();

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('Only JPEG or PNG images are accepted');
    expect(images.calls).toEqual([]);
    expect(tours.calls.map((call) => call.operation)).toEqual(['read']);
  });

  it('returns the parser message for an upload the client got wrong', async () => {
    const parseFile = async () => {
      throw clientError('File exceeds 10 MB limit');
    };
    const { run } = setUp({ parseFile });

    const response = await run();

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('File exceeds 10 MB limit');
  });

  it('rethrows a parser failure that is not the client’s fault', async () => {
    const parseFile = async () => {
      throw new Error('boom');
    };
    const { run } = setUp({ parseFile });

    await expect(run()).rejects.toThrow('boom');
  });

  it('creates the images array for a tour written before the field existed', async () => {
    const { run, storedImages } = setUp({ documents: [{ ...TOUR, images: undefined }] });

    const response = await run();

    expect(response.status).toBe(201);
    expect(storedImages()).toEqual([{ id: IMAGE_ID, blobName: FULL_BLOB }]);
  });

  it('rolls both blobs back and rethrows when the entry cannot be written', async () => {
    const { tours, images, run, storedImages } = setUp();
    tours.failOn('patch', { error: cosmosError(503, 'service unavailable') });

    await expect(run()).rejects.toThrow('service unavailable');

    expect(images.names()).toEqual([]);
    expect(storedImages()).toEqual([]);
  });

  it('surfaces both errors when the entry write and the rollback fail', async () => {
    const { tours, images, run } = setUp();
    tours.failOn('patch', { error: cosmosError(503, 'cosmos down') });
    images.failOn('delete', { error: new Error('storage down'), blobName: THUMBNAIL_BLOB });

    const error = await run().catch((failure) => failure);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe(
      `cosmos down; the rollback failed as well: Deleting the blobs of ${FULL_BLOB} failed`,
    );
    expect(images.names()).toEqual([THUMBNAIL_BLOB]);
  });

  it('deletes the stored size and writes no entry when the other upload fails', async () => {
    const { images, run, storedImages } = setUp();
    images.failOn('upload', { error: new Error('storage down'), blobName: THUMBNAIL_BLOB });

    const error = await run().catch((failure) => failure);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.message).toBe(`Uploading the blobs of ${FULL_BLOB} failed`);
    expect(error.errors.map((failure) => failure.message)).toEqual(['storage down']);
    expect(images.names()).toEqual([]);
    expect(storedImages()).toEqual([]);
  });

  it('accepts a 20th photo and refuses a 21st before parsing the upload', async () => {
    const entries = (count) =>
      Array.from({ length: count }, (_, index) => ({ id: `image-${index}` }));
    const parseFile = vi.fn(fileOf(JPEG));
    const nineteen = setUp({ documents: [{ ...TOUR, images: entries(19) }], parseFile });
    const twenty = setUp({ documents: [{ ...TOUR, images: entries(20) }], parseFile });

    expect((await nineteen.run()).status).toBe(201);
    parseFile.mockClear();
    const refused = await twenty.run();

    expect(refused.status).toBe(400);
    expect(refused.jsonBody.error).toBe('This tour already has the maximum of 20 photos.');
    expect(parseFile).not.toHaveBeenCalled();
    expect(twenty.images.calls).toEqual([]);
  });

  // Two uploads can both read 19 photos; the conditional append lets only one become the 20th.
  it('refuses the photo and rolls its blobs back when a concurrent upload filled the tour', async () => {
    const entries = (count) =>
      Array.from({ length: count }, (_, index) => ({ id: `image-${index}` }));
    const { tours, images, run, storedImages } = setUp({
      documents: [{ ...TOUR, images: entries(19) }],
    });
    tours.beforeNext('patch', () => tours.seed({ ...TOUR, images: entries(20) }));

    const response = await run();

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('This tour already has the maximum of 20 photos.');
    expect(images.names()).toEqual([]);
    expect(storedImages()).toHaveLength(20);
  });

  it('appends only if the tour still carries the ETag it counted', async () => {
    const { tours, run } = setUp();
    const { _etag } = tours.stored(TOUR_ID, 'u1');

    await run();

    const patch = tours.calls.find((call) => call.operation === 'patch');
    expect(patch.options).toEqual({ accessCondition: { type: 'IfMatch', condition: _etag } });
  });

  it('creates the array when a concurrent upload has not, and appends when it has', async () => {
    const { tours, run, storedImages } = setUp({ documents: [{ ...TOUR, images: undefined }] });
    const concurrent = { id: 'concurrent', blobName: `u1/${TOUR_ID}/concurrent.jpg` };
    tours.beforeNext('patch', () => tours.seed({ ...TOUR, images: [concurrent] }));

    expect((await run()).status).toBe(201);

    expect(storedImages().map((entry) => entry.id)).toEqual(['concurrent', IMAGE_ID]);
  });

  it('answers 404 and rolls its blobs back when the tour is deleted during the upload', async () => {
    const { tours, images, run } = setUp();
    tours.beforeNext('patch', () => tours.item(TOUR_ID, 'u1').delete());

    const response = await run();

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Tour not found');
    expect(images.names()).toEqual([]);
  });

  it('answers 404 when the tour is deleted between a conflict and the second count', async () => {
    const { tours, images, run } = setUp();
    tours.failOn('patch', { error: cosmosError(412, 'Precondition failed') });
    tours.beforeNext('read', () => {});
    tours.beforeNext('read', () => tours.item(TOUR_ID, 'u1').delete());

    const response = await run();

    expect(response.status).toBe(404);
    expect(images.names()).toEqual([]);
  });

  it('gives up after ten conflicting writes, rolling its blobs back', async () => {
    const { tours, images, run } = setUp();
    tours.failOn('patch', { error: cosmosError(412, 'Precondition failed'), times: 10 });

    await expect(run()).rejects.toThrow('Precondition failed');

    expect(tours.calls.filter((call) => call.operation === 'patch')).toHaveLength(10);
    expect(images.names()).toEqual([]);
  });

  it("returns 404 for another user's tour that exists, storing nothing", async () => {
    const { tours, images, run, storedImages } = setUp();

    const response = await run(OTHER_TOUR_ID);

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('Tour not found');
    expect(storedImages(OTHER_TOUR_ID, 'u2')).toEqual([]);
    expect(tours.calls).toEqual([{ operation: 'read', id: OTHER_TOUR_ID, partitionKey: 'u1' }]);
    expect(images.calls).toEqual([]);
  });

  it('returns 400 before any read when tourId is not a UUID', async () => {
    const { tours, run } = setUp();

    const response = await run('not-a-uuid');

    expect(response.status).toBe(400);
    expect(tours.calls).toEqual([]);
  });

  it('returns 401 without reading or storing anything when the caller is not signed in', async () => {
    const parseFile = vi.fn(fileOf(JPEG));
    const { tours, images, run } = setUp({ authenticate: signedOut, parseFile });

    const response = await run();

    expect(response.status).toBe(401);
    expect([...tours.calls, ...images.calls]).toEqual([]);
    expect(parseFile).not.toHaveBeenCalled();
  });
});
