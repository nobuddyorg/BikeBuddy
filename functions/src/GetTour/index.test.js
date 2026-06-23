'use strict';

const getTour = require('./index');

const TOUR = {
  id: 't1',
  userId: 'u1',
  name: 'Alps',
  distance: 120,
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockAuth = async (ctx) => {
  ctx.userId = 'u1';
  return true;
};

function makeContainer(readImpl) {
  const read = vi.fn(readImpl);
  const item = vi.fn().mockReturnValue({ read });
  return { container: { item }, item, read };
}

const reqWith = (tourId) => ({ params: { tourId } });
const makeContext = () => ({ res: null, userId: 'u1' });

describe('GET /api/tours/{tourId}', () => {
  it('returns the full tour (incl. heatmapData) with 200', async () => {
    const { container, item } = makeContainer(async () => ({ resource: TOUR }));
    const ctx = makeContext();
    await getTour(ctx, reqWith('t1'), mockAuth, () => container);

    expect(item).toHaveBeenCalledWith('t1', 'u1'); // partition key = userId (ownership)
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toEqual(TOUR);
    expect(ctx.res.body.heatmapData).toHaveLength(2);
  });

  it('returns 404 when read resolves with no resource (missing / other user)', async () => {
    const { container } = makeContainer(async () => ({ resource: undefined }));
    const ctx = makeContext();
    await getTour(ctx, reqWith('nope'), mockAuth, () => container);

    expect(ctx.res.status).toBe(404);
  });

  it('returns 404 when read throws a 404', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('Not found'), { code: 404 });
    });
    const ctx = makeContext();
    await getTour(ctx, reqWith('nope'), mockAuth, () => container);

    expect(ctx.res.status).toBe(404);
  });

  it('re-throws non-404 errors', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('boom'), { code: 503 });
    });
    await expect(getTour(makeContext(), reqWith('t1'), mockAuth, () => container)).rejects.toThrow(
      'boom',
    );
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const { container, item } = makeContainer(async () => ({ resource: TOUR }));
    const ctx = makeContext();
    await getTour(ctx, reqWith('t1'), failAuth, () => container);

    expect(ctx.res.status).toBe(401);
    expect(item).not.toHaveBeenCalled();
  });
});
