'use strict';

const uploadImage = require('./index');

// Minimal valid magic-byte buffers.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOT_IMAGE = Buffer.from('hello world');

const TOUR = { id: 't1', userId: 'u1', name: 'Alps', images: [] };

const mockAuth = async (ctx) => {
  ctx.userId = 'u1';
  return true;
};

function makeToursContainer(readImpl) {
  const read = vi.fn(readImpl);
  const replace = vi.fn(async (doc) => ({ resource: doc }));
  const item = vi.fn().mockReturnValue({ read, replace });
  return { container: { item }, item, read, replace };
}

function makeImagesContainer() {
  const blockBlob = {
    uploadData: vi.fn().mockResolvedValue({}),
    generateSasUrl: vi.fn().mockResolvedValue('https://blob/sas-url'),
  };
  const getBlockBlobClient = vi.fn().mockReturnValue(blockBlob);
  return { container: { getBlockBlobClient }, getBlockBlobClient, blockBlob };
}

const makeParseFile = (buffer) =>
  vi.fn().mockResolvedValue({ filename: 'p.jpg', mimeType: 'image/jpeg', buffer });
const noResize = (buf) => Promise.resolve(buf); // skip sharp in unit tests
const reqWith = (tourId) => ({ params: { tourId } });
const makeContext = () => ({ res: null, userId: 'u1' });

describe('POST /api/tours/{tourId}/images', () => {
  it('resizes, stores, appends to tour.images and returns 201 + SAS url', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const ctx = makeContext();

    await uploadImage(
      ctx,
      reqWith('t1'),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );

    expect(ctx.res.status).toBe(201);
    expect(ctx.res.body.url).toBe('https://blob/sas-url');
    expect(images.blockBlob.uploadData).toHaveBeenCalled();
    const [doc] = tours.replace.mock.calls[0];
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0].id).toBe(ctx.res.body.id);
    expect(doc.images[0].blobName).toBe(`u1/t1/${ctx.res.body.id}.jpg`);
  });

  it('accepts PNG by magic bytes', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await uploadImage(
      ctx,
      reqWith('t1'),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(PNG),
      noResize,
    );
    expect(ctx.res.status).toBe(201);
  });

  it('rejects non-image files with 400', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: [] } }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await uploadImage(
      ctx,
      reqWith('t1'),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(NOT_IMAGE),
      noResize,
    );
    expect(ctx.res.status).toBe(400);
    expect(images.getBlockBlobClient).not.toHaveBeenCalled();
    expect(tours.replace).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await uploadImage(
      ctx,
      reqWith('nope'),
      mockAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(ctx.res.status).toBe(404);
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await uploadImage(
      ctx,
      reqWith('t1'),
      failAuth,
      () => tours.container,
      () => images.container,
      makeParseFile(JPEG),
      noResize,
    );
    expect(ctx.res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
