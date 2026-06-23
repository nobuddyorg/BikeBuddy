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

function makeContainer(readImpl) {
  const read = vi.fn(readImpl);
  const replace = vi.fn(async (doc) => ({ resource: doc }));
  const item = vi.fn().mockReturnValue({ read, replace });
  return { container: { item }, item, read, replace };
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
    expect(c.replace).not.toHaveBeenCalled();
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
    expect(c.replace).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await editTour(reqWith(TID, { name: 'X' }), failAuth, () => c.container);

    expect(res.status).toBe(401);
    expect(c.item).not.toHaveBeenCalled();
  });
});
