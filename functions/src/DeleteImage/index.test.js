'use strict';

const deleteImage = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const IMG1 = '22222222-2222-4222-8222-222222222222';
const IMG2 = '33333333-3333-4333-8333-333333333333';
const GHOST = '44444444-4444-4444-8444-444444444444';
const IMG = { id: IMG1, blobName: `u1/${TID}/${IMG1}.jpg` };
const TOUR = {
  id: TID,
  userId: 'u1',
  name: 'Alps',
  images: [IMG, { id: IMG2, blobName: `u1/${TID}/${IMG2}.jpg` }],
};

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
  const deleteIfExists = vi.fn().mockResolvedValue({ succeeded: true });
  const getBlockBlobClient = vi.fn().mockReturnValue({ deleteIfExists });
  return { container: { getBlockBlobClient }, getBlockBlobClient, deleteIfExists };
}

const reqWith = (tourId, imageId) => ({ params: { tourId, imageId } });
const makeContext = () => ({ res: null, userId: 'u1' });

describe('DELETE /api/tours/{tourId}/images/{imageId}', () => {
  it('deletes the blob, removes the entry, returns 204', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    const images = makeImagesContainer();
    const ctx = makeContext();

    await deleteImage(
      ctx,
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(images.getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}/${IMG1}.jpg`);
    expect(images.deleteIfExists).toHaveBeenCalled();
    const [doc] = tours.replace.mock.calls[0];
    expect(doc.images.map((i) => i.id)).toEqual([IMG2]);
    expect(ctx.res.status).toBe(204);
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await deleteImage(
      ctx,
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );
    expect(ctx.res.status).toBe(404);
    expect(images.deleteIfExists).not.toHaveBeenCalled();
  });

  it('returns 404 when the image id is unknown', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await deleteImage(
      ctx,
      reqWith(TID, GHOST),
      mockAuth,
      () => tours.container,
      () => images.container,
    );
    expect(ctx.res.status).toBe(404);
    expect(images.deleteIfExists).not.toHaveBeenCalled();
    expect(tours.replace).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const ctx = makeContext();
    await deleteImage(
      ctx,
      reqWith(TID, IMG1),
      failAuth,
      () => tours.container,
      () => images.container,
    );
    expect(ctx.res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
