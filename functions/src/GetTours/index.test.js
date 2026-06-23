'use strict';

const getTours = require('./index');

const TOURS = [
  { id: 't2', name: 'Newer', distance: 100, createdAt: '2026-02-01T00:00:00.000Z' },
  { id: 't1', name: 'Older', distance: 50, createdAt: '2026-01-01T00:00:00.000Z' },
];

const mockAuth = async (ctx) => {
  ctx.userId = 'u1';
  return true;
};

function makeContainer(resources = TOURS) {
  const fetchAll = vi.fn().mockResolvedValue({ resources });
  const query = vi.fn().mockReturnValue({ fetchAll });
  return { container: { items: { query } }, query, fetchAll };
}

function makeContext() {
  return { res: null, userId: 'u1' };
}

describe('GET /api/tours', () => {
  it('returns the user tours with 200', async () => {
    const { container } = makeContainer();
    const ctx = makeContext();
    await getTours(ctx, {}, mockAuth, () => container);

    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toEqual(TOURS);
  });

  it('queries scoped to the authenticated userId (single partition)', async () => {
    const { container, query } = makeContainer();
    await getTours(makeContext(), {}, mockAuth, () => container);

    const [spec, options] = query.mock.calls[0];
    expect(spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
    expect(options).toEqual({ partitionKey: 'u1' });
    // heatmapData must not be selected in the list query
    expect(spec.query).not.toMatch(/heatmapData/);
    expect(spec.query).toMatch(/ORDER BY c\.createdAt DESC/);
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    };
    const { container } = makeContainer();
    const ctx = makeContext();
    await getTours(ctx, {}, failAuth, () => container);

    expect(ctx.res.status).toBe(401);
    expect(container.items.query).not.toHaveBeenCalled();
  });
});
