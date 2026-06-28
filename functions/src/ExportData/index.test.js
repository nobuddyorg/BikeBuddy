'use strict';

const { exportData } = require('./index');

const USER = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const TOURS = [{ id: 't1', userId: 'u1', name: 'Alps' }];

const mockAuth = async () => ({ userId: 'u1' });

function makeUsers() {
  return { item: vi.fn().mockReturnValue({ read: async () => ({ resource: USER }) }) };
}
function makeTours(resources = TOURS) {
  const fetchAll = vi.fn().mockResolvedValue({ resources });
  const query = vi.fn().mockReturnValue({ fetchAll });
  return { container: { items: { query } }, query, fetchAll };
}

describe('GET /api/me/export', () => {
  it('returns 401 when auth fails', async () => {
    const res = await exportData(
      {},
      async () => null,
      makeUsers,
      () => makeTours().container,
    );
    expect(res.status).toBe(401);
  });

  it('returns the user doc and their tours, scoped to the partition', async () => {
    const tours = makeTours();
    const res = await exportData({}, mockAuth, makeUsers, () => tours.container);

    expect(res.status).toBe(200);
    expect(res.headers['Content-Disposition']).toContain('bikebuddy-export.json');
    expect(res.jsonBody.user).toEqual(USER);
    expect(res.jsonBody.tours).toEqual(TOURS);
    expect(res.jsonBody.exportedAt).toBeTruthy();

    const [spec, options] = tours.query.mock.calls[0];
    expect(spec.query).toMatch(/SELECT \* FROM c WHERE c\.userId = @userId/);
    expect(spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
    expect(options).toEqual({ partitionKey: 'u1' });
  });
});
