'use strict';

const editTour = require('./index');

const TOUR = {
  id: 't1',
  userId: 'u1',
  name: 'Old name',
  description: 'old',
  distance: 120,
  heatmapData: [[48.1, 11.5]],
  images: [],
};

const mockAuth = async (ctx) => {
  ctx.userId = 'u1';
  return true;
};

function makeContainer(readImpl) {
  const read = vi.fn(readImpl);
  const replace = vi.fn(async (doc) => ({ resource: doc }));
  const item = vi.fn().mockReturnValue({ read, replace });
  return { container: { item }, item, read, replace };
}

const reqWith = (tourId, body) => ({ params: { tourId }, body });
const makeContext = () => ({ res: null, userId: 'u1' });

describe('PATCH /api/tours/{tourId}', () => {
  it('updates name + description and returns the updated doc', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const ctx = makeContext();
    await editTour(
      ctx,
      reqWith('t1', { name: 'New', description: 'new desc' }),
      mockAuth,
      () => c.container,
    );

    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body.name).toBe('New');
    expect(ctx.res.body.description).toBe('new desc');
    // unchanged fields preserved
    expect(ctx.res.body.heatmapData).toEqual(TOUR.heatmapData);
    expect(ctx.res.body.distance).toBe(120);
    expect(c.item).toHaveBeenCalledWith('t1', 'u1'); // partition key = userId
  });

  it('patches only the provided field', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const ctx = makeContext();
    await editTour(ctx, reqWith('t1', { name: 'Renamed' }), mockAuth, () => c.container);

    expect(ctx.res.body.name).toBe('Renamed');
    expect(ctx.res.body.description).toBe('old'); // untouched
  });

  it('ignores non-editable fields in the body', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const ctx = makeContext();
    await editTour(
      ctx,
      reqWith('t1', { name: 'X', heatmapData: [], distance: 9999 }),
      mockAuth,
      () => c.container,
    );

    expect(ctx.res.body.heatmapData).toEqual(TOUR.heatmapData);
    expect(ctx.res.body.distance).toBe(120);
  });

  it('returns 400 on invalid input', async () => {
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const ctx = makeContext();
    await editTour(ctx, reqWith('t1', { name: '' }), mockAuth, () => c.container);

    expect(ctx.res.status).toBe(400);
    expect(c.replace).not.toHaveBeenCalled();
  });

  it('returns 404 when the tour is not in the caller partition', async () => {
    const c = makeContainer(async () => ({ resource: undefined }));
    const ctx = makeContext();
    await editTour(ctx, reqWith('nope', { name: 'X' }), mockAuth, () => c.container);

    expect(ctx.res.status).toBe(404);
    expect(c.replace).not.toHaveBeenCalled();
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const c = makeContainer(async () => ({ resource: { ...TOUR } }));
    const ctx = makeContext();
    await editTour(ctx, reqWith('t1', { name: 'X' }), failAuth, () => c.container);

    expect(ctx.res.status).toBe(401);
    expect(c.item).not.toHaveBeenCalled();
  });
});
