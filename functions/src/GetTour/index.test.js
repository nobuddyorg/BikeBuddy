'use strict';

const { getTour } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';

const TOUR = {
  id: TID,
  userId: 'u1',
  name: 'Alps',
  distance: 120,
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockAuth = async () => ({ userId: 'u1' });

function makeContainer(readImpl) {
  const read = vi.fn(readImpl);
  const item = vi.fn().mockReturnValue({ read });
  return { container: { item }, item, read };
}

const reqWith = (tourId) => ({ params: { tourId } });

describe('GET /api/tours/{tourId}', () => {
  it('returns the full tour (incl. heatmapData) with 200', async () => {
    const { container, item } = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(item).toHaveBeenCalledWith(TID, 'u1'); // partition key = userId (ownership)
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ ...TOUR, images: [] });
    expect(res.jsonBody.heatmapData).toHaveLength(2);
  });

  it('returns images as { id, url } with a read SAS URL', async () => {
    const tour = {
      ...TOUR,
      images: [
        { id: 'img1', blobName: 'u1/t1/img1.jpg' },
        { id: 'img2', blobName: 'u1/t1/img2.jpg' },
      ],
    };
    const { container } = makeContainer(async () => ({ resource: tour }));
    const getBlockBlobClient = vi.fn((name) => ({
      generateSasUrl: async () => `https://blob/${name}?sig=x`,
    }));
    const imagesContainer = () => Promise.resolve({ getBlockBlobClient });

    const res = await getTour(reqWith(TID), mockAuth, () => container, imagesContainer);

    expect(res.jsonBody.images).toEqual([
      { id: 'img1', url: 'https://blob/u1/t1/img1.jpg?sig=x' },
      { id: 'img2', url: 'https://blob/u1/t1/img2.jpg?sig=x' },
    ]);
  });

  it('returns 400 when tourId is not a UUID', async () => {
    const { container, item } = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await getTour(reqWith('not-a-uuid'), mockAuth, () => container);

    expect(res.status).toBe(400);
    expect(item).not.toHaveBeenCalled();
  });

  it('returns 404 when read resolves with no resource (missing / other user)', async () => {
    const { container } = makeContainer(async () => ({ resource: undefined }));
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(res.status).toBe(404);
  });

  it('returns 404 when read throws a 404', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('Not found'), { code: 404 });
    });
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(res.status).toBe(404);
  });

  it('re-throws non-404 errors', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('boom'), { code: 503 });
    });
    await expect(getTour(reqWith(TID), mockAuth, () => container)).rejects.toThrow('boom');
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const { container, item } = makeContainer(async () => ({ resource: TOUR }));
    const res = await getTour(reqWith(TID), failAuth, () => container);

    expect(res.status).toBe(401);
    expect(item).not.toHaveBeenCalled();
  });
});
