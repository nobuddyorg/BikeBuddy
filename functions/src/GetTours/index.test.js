'use strict';

const { getTours } = require('./index');

const TOURS = [
  { id: 't2', name: 'Newer', distance: 100, createdAt: '2026-02-01T00:00:00.000Z' },
  { id: 't1', name: 'Older', distance: 50, createdAt: '2026-01-01T00:00:00.000Z' },
];

const mockAuth = async () => ({ userId: 'u1' });
const req = {};

function makeContainer(resources = TOURS) {
  const fetchAll = vi.fn().mockResolvedValue({ resources });
  const query = vi.fn().mockReturnValue({ fetchAll });
  return { container: { items: { query } }, query, fetchAll };
}

describe('GET /api/tours', () => {
  it('returns the user tours with 200', async () => {
    const { container } = makeContainer();
    const res = await getTours(req, mockAuth, () => container);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual(TOURS);
  });

  it('queries scoped to the authenticated userId (single partition)', async () => {
    const { container, query } = makeContainer();
    await getTours(req, mockAuth, () => container);

    const [spec, options] = query.mock.calls[0];
    expect(spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
    expect(options).toEqual({ partitionKey: 'u1' });
    expect(spec.query).not.toMatch(/heatmapData/);
    expect(spec.query).toMatch(/ORDER BY c\.createdAt DESC/);
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const { container } = makeContainer();
    const res = await getTours(req, failAuth, () => container);

    expect(res.status).toBe(401);
    expect(container.items.query).not.toHaveBeenCalled();
  });
});
