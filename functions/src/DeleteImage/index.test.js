'use strict';

const { deleteImage } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';
const IMG1 = '22222222-2222-4222-8222-222222222222';
const IMG2 = '33333333-3333-4333-8333-333333333333';
const GHOST = '44444444-4444-4444-8444-444444444444';
const IMG = { id: IMG1, blobName: `u1/${TID}/${IMG1}.jpg` };
const TOUR = {
  id: TID,
  userId: 'u1',
  name: 'Alps',
  _etag: '"etag-v1"',
  images: [IMG, { id: IMG2, blobName: `u1/${TID}/${IMG2}.jpg` }],
};

const mockAuth = async () => ({ userId: 'u1' });

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

describe('DELETE /api/tours/{tourId}/images/{imageId}', () => {
  it('deletes the blob, removes the entry, returns 204', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(images.getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}/${IMG1}.jpg`);
    expect(images.deleteIfExists).toHaveBeenCalled();
    const [doc, options] = tours.replace.mock.calls[0];
    expect(doc.images.map((i) => i.id)).toEqual([IMG2]);
    expect(options).toEqual({ accessCondition: { type: 'IfMatch', condition: TOUR._etag } });
    expect(res.status).toBe(204);
  });

  it('removes the entry before deleting the blob (#354)', async () => {
    const order = [];
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    tours.replace.mockImplementation(async (doc) => {
      order.push('doc');
      return { resource: doc };
    });
    const images = makeImagesContainer();
    images.deleteIfExists.mockImplementation(async () => {
      order.push('blob');
      return { succeeded: true };
    });

    await deleteImage(
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    // Blob-first would leave tour.images referencing a deleted blob — a
    // permanently broken thumbnail — if the write below then failed.
    expect(order).toEqual(['doc', 'blob']);
  });

  it('does not delete the blob when the entry removal fails (#354)', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    // Never resolves a 412 → the retry loop exhausts and rethrows.
    tours.replace.mockRejectedValue(Object.assign(new Error('conflict'), { code: 412 }));
    const images = makeImagesContainer();

    await expect(
      deleteImage(
        reqWith(TID, IMG1),
        mockAuth,
        () => tours.container,
        () => images.container,
      ),
    ).rejects.toThrow('conflict');

    expect(images.deleteIfExists).not.toHaveBeenCalled();
  });

  it('does not retry a non-412 error, even on the first attempt', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    tours.replace.mockRejectedValue(Object.assign(new Error('service unavailable'), { code: 503 }));
    const images = makeImagesContainer();

    await expect(
      deleteImage(
        reqWith(TID, IMG1),
        mockAuth,
        () => tours.container,
        () => images.container,
      ),
    ).rejects.toThrow('service unavailable');

    // A non-412 error must throw immediately (attempt 0), not fall into the
    // conflict-retry loop that's only meant for 412s: replace() is called
    // once, and read() only from the initial load, never from a retry.
    expect(tours.replace).toHaveBeenCalledTimes(1);
    expect(tours.read).toHaveBeenCalledTimes(1);
  });

  // .replace() overwrites the whole document, so without an ETag check two
  // deletes racing on the same tour could silently clobber each other (same
  // class of bug as UploadImage's — see index.js). A 412 means someone else's
  // write landed first; re-read and retry against the fresh version.
  it('retries against a fresh read after a 412 conflict, then succeeds', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ resource: { ...TOUR, images: [...TOUR.images] } })
      .mockResolvedValueOnce({
        resource: { ...TOUR, _etag: '"etag-v2"', images: [...TOUR.images] },
      });
    const replace = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 412 }))
      .mockResolvedValueOnce({ resource: {} });
    const item = vi.fn().mockReturnValue({ read, replace });
    const tours = { container: { item } };
    const images = makeImagesContainer();

    const res = await deleteImage(
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(204);
    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace.mock.calls[0][1]).toEqual({
      accessCondition: { type: 'IfMatch', condition: '"etag-v1"' },
    });
    expect(replace.mock.calls[1][1]).toEqual({
      accessCondition: { type: 'IfMatch', condition: '"etag-v2"' },
    });
    // The blob delete isn't retried — only the document write races.
    expect(images.deleteIfExists).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated 412 conflicts', async () => {
    const read = vi.fn().mockResolvedValue({ resource: { ...TOUR, images: [...TOUR.images] } });
    const replace = vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { code: 412 }));
    const item = vi.fn().mockReturnValue({ read, replace });
    const tours = { container: { item } };
    const images = makeImagesContainer();

    await expect(
      deleteImage(
        reqWith(TID, IMG1),
        mockAuth,
        () => tours.container,
        () => images.container,
      ),
    ).rejects.toThrow('conflict');
    expect(replace).toHaveBeenCalledTimes(3);
  });

  it('returns 400 when an id is not a UUID', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, 'bad'),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(400);
    expect(tours.item).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const tours = makeToursContainer(async () => ({ resource: undefined }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(404);
    expect(images.deleteIfExists).not.toHaveBeenCalled();
  });

  it('returns 404 when the image id is unknown', async () => {
    const tours = makeToursContainer(async () => ({
      resource: { ...TOUR, images: [...TOUR.images] },
    }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, GHOST),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toBe('Image not found');
    expect(images.deleteIfExists).not.toHaveBeenCalled();
    expect(tours.replace).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour has no images at all', async () => {
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR, images: undefined } }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, IMG1),
      mockAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(404);
    expect(images.deleteIfExists).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const tours = makeToursContainer(async () => ({ resource: { ...TOUR } }));
    const images = makeImagesContainer();
    const res = await deleteImage(
      reqWith(TID, IMG1),
      failAuth,
      () => tours.container,
      () => images.container,
    );

    expect(res.status).toBe(401);
    expect(tours.item).not.toHaveBeenCalled();
  });
});
