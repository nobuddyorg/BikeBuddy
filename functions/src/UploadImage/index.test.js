'use strict';

const sharp = require('sharp');
const { uploadImage, isJpegOrPng } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOT_IMAGE = Buffer.from('hello world');

const TOUR = { id: TID, userId: 'u1', name: 'Alps', images: [] };

const mockAuth = async () => ({ userId: 'u1' });

function makeToursContainer(readImpl) {
  const read = vi.fn(readImpl);
  const replace = vi.fn(async (doc) => ({ resource: doc }));
  const patch = vi.fn(async () => ({}));
  const item = vi.fn().mockReturnValue({ read, replace, patch });
  return { container: { item }, item, read, replace, patch };
}

function makeImagesContainer() {
  const blockBlob = {
    uploadData: vi.fn().mockResolvedValue({}),
    generateSasUrl: vi.fn().mockResolvedValue('https://blob/sas-url'),
  };
  const getBlockBlobClient = vi.fn().mockReturnValue(blockBlob);
  return { container: { getBlockBlobClient }, getBlockBlobClient, blockBlob };
}

const makeParseFile = (buffer, mimeType = 'image/jpeg') =>
  vi.fn().mockResolvedValue({ filename: 'p.jpg', mimeType, buffer });
// Stands in for resizeVariants: real sharp processing on these fake,
// magic-bytes-only buffers would reject them as unreadable images.
const noResize = (buf) => Promise.resolve({ full: buf, thumbnail: buf });
const reqWith = (tourId) => ({ params: { tourId } });

describe('isJpegOrPng (magic-byte validation)', () => {
  it('accepts valid 4-byte JPEG and PNG signatures', () => {
    expect(isJpegOrPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpegOrPng(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  it('rejects a buffer shorter than 4 bytes', () => {
    expect(isJpegOrPng(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it.each([
    ['JPEG byte 0', [0x00, 0xd8, 0xff, 0xe0]],
    ['JPEG byte 1', [0xff, 0x00, 0xff, 0xe0]],
    ['JPEG byte 2', [0xff, 0xd8, 0x00, 0xe0]],
    ['PNG byte 0', [0x00, 0x50, 0x4e, 0x47]],
    ['PNG byte 1', [0x89, 0x00, 0x4e, 0x47]],
    ['PNG byte 2', [0x89, 0x50, 0x00, 0x47]],
    ['PNG byte 3', [0x89, 0x50, 0x4e, 0x00]],
  ])('rejects when %s is wrong', (_label, bytes) => {
    expect(isJpegOrPng(Buffer.from(bytes))).toBe(false);
  });
});

describe('POST /api/tours/{tourId}/images', () => {
  it('resizes, stores, appends to tour.images and returns 201 + SAS url', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );

    expect(res.status).toBe(201);
    expect(res.jsonBody.url).toBe('https://blob/sas-url');
    expect(res.jsonBody.thumbUrl).toBe('https://blob/sas-url');
    expect(images.blockBlob.uploadData).toHaveBeenCalledWith(JPEG, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
    expect(images.getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}/${res.jsonBody.id}.jpg`);
    expect(images.getBlockBlobClient).toHaveBeenCalledWith(
      `u1/${TID}/${res.jsonBody.id}_thumb.jpg`,
    );
    const [ops] = tours.patch.mock.calls[0];
    expect(ops).toEqual([
      {
        op: 'add',
        path: '/images/-',
        value: { id: res.jsonBody.id, blobName: `u1/${TID}/${res.jsonBody.id}.jpg` },
      },
    ]);
  });

  it('uploads both the full image and the thumbnail as separate blobs', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const full = Buffer.from('full-bytes');
    const thumbnail = Buffer.from('thumb-bytes');
    const resize = async () => ({ full, thumbnail });

    await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      resize,
    );

    expect(images.blockBlob.uploadData).toHaveBeenCalledWith(full, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
    expect(images.blockBlob.uploadData).toHaveBeenCalledWith(thumbnail, {
      blobHTTPHeaders: { blobContentType: 'image/jpeg' },
    });
  });

  // Every other test injects a resize stub (real sharp processing rejects
  // their fake magic-bytes-only buffers) — this is the one that exercises
  // the actual default (resizeVariants -> resizeImage + resizeThumbnail)
  // end-to-end, with a real decodable JPEG.
  it('resizes for real when no resize override is given', async () => {
    const validJpeg = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();

    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(validJpeg),
    );

    expect(res.status).toBe(201);
    expect(images.blockBlob.uploadData).toHaveBeenCalledTimes(2);
  });

  // Appending via the atomic /images/- patch (rather than reading tour.images
  // and writing the whole document back) is what prevents this upload from
  // losing a concurrent request's image — see UploadImage/index.js.
  it('appends via /images/- rather than reading and replacing the whole array', async () => {
    const existing = { id: 'img0', blobName: 'u1/old.jpg' };
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [existing] },
    }));
    const images = makeImagesContainer();
    await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
      async () => null,
    );

    expect(tours.replace).not.toHaveBeenCalled();
    const [ops] = tours.patch.mock.calls[0];
    expect(ops).toEqual([{ op: 'add', path: '/images/-', value: expect.any(Object) }]);
  });

  // Deadlocks if the handler awaits the GPS read before calling resize: readGps
  // only settles once resize has been entered, so a sequential handler times out.
  it('starts the resize without waiting for the GPS read to finish', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    let resizeEntered;
    const resizeStarted = new Promise((resolve) => {
      resizeEntered = resolve;
    });
    const resize = vi.fn(async (buffer) => {
      resizeEntered();
      return { full: buffer, thumbnail: buffer };
    });
    const readGps = vi.fn(async () => {
      await resizeStarted;
      return null;
    });

    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      resize,
      readGps,
    );

    expect(res.status).toBe(201);
  });

  it('stores and returns GPS coords when the image is geotagged', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const readGps = vi.fn().mockResolvedValue({ lat: 48.137, lon: 11.575 });
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
      readGps,
    );

    expect(res.status).toBe(201);
    expect(res.jsonBody).toMatchObject({ lat: 48.137, lon: 11.575 });
    const [ops] = tours.patch.mock.calls[0];
    expect(ops[0].value).toMatchObject({ lat: 48.137, lon: 11.575 });
  });

  it('omits coords for an image without GPS', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
      async () => null,
    );

    expect(res.jsonBody.lat).toBeUndefined();
    const [ops] = tours.patch.mock.calls[0];
    expect(ops[0].value.lat).toBeUndefined();
  });

  it('accepts PNG by magic bytes', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(PNG),
      noResize,
    );
    expect(res.status).toBe(201);
  });

  it('rejects non-image files with 400', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(NOT_IMAGE),
      noResize,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toBe('Only JPEG or PNG images are accepted');
    expect(images.getBlockBlobClient).not.toHaveBeenCalled();
    expect(tours.patch).not.toHaveBeenCalled();
  });

  it('rejects a non-image content-type even with image magic bytes', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG, 'text/plain'),
      noResize,
    );
    expect(res.status).toBe(400);
    expect(images.getBlockBlobClient).not.toHaveBeenCalled();
  });

  it('returns 400 when tourId is not a UUID', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith('not-a-uuid'),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(res.status).toBe(400);
    expect(tours.item).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toBe('Tour not found');
  });

  it('falls back to creating the images array for a tour that predates the field', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: undefined } }));
    // Cosmos rejects an "add /images/-" patch when /images isn't an existing
    // array — only tours from before the images field existed hit this.
    tours.patch.mockRejectedValueOnce(Object.assign(new Error('Invalid patch'), { code: 400 }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(res.status).toBe(201);
    expect(tours.patch).toHaveBeenCalledTimes(2);
    const [fallbackOps] = tours.patch.mock.calls[1];
    expect(fallbackOps).toEqual([
      {
        op: 'add',
        path: '/images',
        value: [{ id: res.jsonBody.id, blobName: expect.any(String) }],
      },
    ]);
  });

  it('rethrows a non-400 error from the images/- patch without falling back', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    tours.patch.mockRejectedValueOnce(
      Object.assign(new Error('service unavailable'), { code: 503 }),
    );
    const images = makeImagesContainer();
    await expect(
      uploadImage(
        reqWith(TID),
        mockAuth,
        () => tours.container,
        () => images.container,
        makeParseFile(JPEG),
        noResize,
      ),
    ).rejects.toThrow('service unavailable');
    expect(tours.patch).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when the tour already has 20 images', async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({ id: `img${i}`, blobName: `u1/${i}.jpg` }));
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: full } }));
    const images = makeImagesContainer();
    const parseFile = makeParseFile(JPEG);
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      parseFile,
      noResize,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toBe('This tour already has the maximum of 20 photos.');
    expect(parseFile).not.toHaveBeenCalled();
    expect(images.getBlockBlobClient).not.toHaveBeenCalled();
  });

  it('returns the parseFile error status/message when parsing fails', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const parseFile = vi.fn().mockRejectedValue(
      Object.assign(new Error('Bad multipart body'), {
        status: 400,
      }),
    );
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      parseFile,
      noResize,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toBe('Bad multipart body');
  });

  it('defaults to 500 when the parseFile error has no status', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const parseFile = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await uploadImage(
      reqWith(TID),
      mockAuth,
      () => tours.container,
      () => images.container,
      parseFile,
      noResize,
    );
    expect(res.status).toBe(500);
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const res = await uploadImage(
      reqWith(TID),
      failAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
