'use strict';

const { editTour } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';

const TOUR = {
  id: TID,
  userId: 'u1',
  name: 'Old name',
  description: 'old',
  distance: 120,
  heatmapData: [[48.1, 11.5]],
  images: [],
};

const mockAuth = async () => ({ userId: 'u1' });

// Applies the patch operations to the stored doc the way Cosmos would, so the
// tests assert against the real post-write document rather than the request.
function makeContainer(readImpl, stored = null) {
  const read = vi.fn(readImpl);
  const patch = vi.fn(async (operations) => {
    const doc = { ...(stored ?? (await read()).resource) };
    for (const { path, value } of operations) doc[path.slice(1)] = value;
    return { resource: doc };
  });
  const item = vi.fn().mockReturnValue({ read, patch });
  return { container: { item }, item, read, patch };
}

const reqWith = (tourId, body) => ({ params: { tourId }, json: async () => body });

describe('PATCH /api/tours/{tourId}', () => {
  it('updates name + description and returns the updated doc', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(
      reqWith(TID, { name: 'New', description: 'new desc' }),
      mockAuth,
      () => c.container,
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.name).toBe('New');
    expect(res.jsonBody.description).toBe('new desc');
    expect(res.jsonBody.heatmapData).toEqual(TOUR.heatmapData);
    expect(res.jsonBody.distance).toBe(120);
    expect(c.item).toHaveBeenCalledWith(TID, 'u1');
  });

  it('patches only the provided field', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith(TID, { name: 'Renamed' }), mockAuth, () => c.container);

    expect(res.jsonBody.name).toBe('Renamed');
    expect(res.jsonBody.description).toBe('old');
  });

  it('patches the tour date (createdAt)', async () => {
    const c = makeContainer(async () => ({
      resource: { ...TOUR, createdAt: '2026-01-01T00:00:00.000Z' },
    }));
    const res = await editTour(
      reqWith(TID, { createdAt: '2026-05-01T10:00:00.000Z' }),
      mockAuth,
      () => c.container,
    );

    expect(res.status).toBe(200);
    expect(res.jsonBody.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(res.jsonBody.name).toBe('Old name');
  });

  it('returns 400 when createdAt is not a valid ISO datetime', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(
      reqWith(TID, { createdAt: '2026-05-01' }),
      mockAuth,
      () => c.container,
    );

    expect(res.status).toBe(400);
    expect(c.patch).not.toHaveBeenCalled();
  });

  it('patches description only, leaving name untouched', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(
      reqWith(TID, { description: 'new desc' }),
      mockAuth,
      () => c.container,
    );

    expect(res.jsonBody.name).toBe('Old name');
    expect(res.jsonBody.description).toBe('new desc');
  });

  it('treats a null JSON body as no changes', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith(TID, null), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(res.jsonBody.name).toBe('Old name');
    expect(res.jsonBody.description).toBe('old');
    // Nothing changed, so nothing is written — Cosmos rejects an empty patch.
    expect(c.patch).not.toHaveBeenCalled();
  });

  it('writes one set operation per provided field, and only those', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    await editTour(
      reqWith(TID, {
        name: 'New',
        description: 'new desc',
        createdAt: '2026-05-01T10:00:00.000Z',
      }),
      mockAuth,
      () => c.container,
    );

    expect(c.patch).toHaveBeenCalledWith([
      { op: 'set', path: '/name', value: 'New' },
      { op: 'set', path: '/description', value: 'new desc' },
      { op: 'set', path: '/createdAt', value: '2026-05-01T10:00:00.000Z' },
    ]);
  });

  it('does not clobber a photo uploaded between the read and the write (#351)', async () => {
    const NEW_IMAGE = { id: 'img-1', blobName: 'u1/t/img-1.jpg' };
    // An UploadImage patch ('/images/-') landed after editTour read the doc, so
    // the request's snapshot has images: [] while the stored doc has one image.
    // A .replace() of the snapshot would drop it; a per-field patch must not.
    const c = makeContainer(async () => ({ resource: { ...TOUR, images: [] } }), {
      ...TOUR,
      images: [NEW_IMAGE],
    });

    const res = await editTour(reqWith(TID, { name: 'Renamed' }), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(res.jsonBody.name).toBe('Renamed');
    expect(res.jsonBody.images).toEqual([NEW_IMAGE]);
    expect(c.patch).toHaveBeenCalledWith([{ op: 'set', path: '/name', value: 'Renamed' }]);
  });

  it('ignores non-editable fields in the body', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(
      reqWith(TID, { name: 'X', heatmapData: [], distance: 9999 }),
      mockAuth,
      () => c.container,
    );

    expect(res.jsonBody.heatmapData).toEqual(TOUR.heatmapData);
    expect(res.jsonBody.distance).toBe(120);
  });

  it('returns 400 on invalid input', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith(TID, { name: '' }), mockAuth, () => c.container);

    expect(res.status).toBe(400);
    expect(c.patch).not.toHaveBeenCalled();
  });

  it('returns 400 when tourId is not a UUID', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith('bad', { name: 'X' }), mockAuth, () => c.container);

    expect(res.status).toBe(400);
    expect(c.item).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const c = makeContainer(async () => ({ resource: undefined }));
    const res = await editTour(reqWith(TID, { name: 'X' }), mockAuth, () => c.container);

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toBe('Tour not found');
    expect(c.patch).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith(TID, { name: 'X' }), failAuth, () => c.container);

    expect(res.status).toBe(401);
    expect(c.item).not.toHaveBeenCalled();
  });
});
