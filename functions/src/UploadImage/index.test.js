'use strict';

const { uploadImage } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOT_IMAGE = Buffer.from('hello world');

const TOUR = { id: TID, userId: 'u1', name: 'Alps', images: [] };

const mockAuth = async () => ({ userId: 'u1' });

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

const makeParseFile = (buffer, mimeType = 'image/jpeg') =>
  vi.fn().mockResolvedValue({ filename: 'p.jpg', mimeType, buffer });
const noResize = (buf) => Promise.resolve(buf);
const reqWith = (tourId) => ({ params: { tourId } });

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
    expect(images.blockBlob.uploadData).toHaveBeenCalled();
    const [doc] = tours.replace.mock.calls[0];
    expect(doc.images).toHaveLength(1);
    expect(doc.images[0].id).toBe(res.jsonBody.id);
    expect(doc.images[0].blobName).toBe(`u1/${TID}/${res.jsonBody.id}.jpg`);
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
    expect(images.getBlockBlobClient).not.toHaveBeenCalled();
    expect(tours.replace).not.toHaveBeenCalled();
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
