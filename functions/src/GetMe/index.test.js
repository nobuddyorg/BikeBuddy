'use strict';

const { getMe } = require('./index');

const STORED_USER = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockAuth = async () => ({ userId: 'u1', userEmail: 'ada@example.com', userName: 'Ada' });
const req = {};

function makeContainer(overrides = {}) {
  return {
    item: vi.fn().mockReturnValue({ read: async () => ({ resource: STORED_USER }) }),
    items: { create: vi.fn().mockResolvedValue({ resource: STORED_USER }) },
    ...overrides,
  };
}

describe('GET /api/me', () => {
  test('returns existing user document', async () => {
    const container = makeContainer();
    const res = await getMe(req, mockAuth, () => container);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual(STORED_USER);
  });

  test('creates user document on first login (404 thrown)', async () => {
    const err = Object.assign(new Error('Not found'), { code: 404 });
    const container = makeContainer({
      item: vi.fn().mockReturnValue({
        read: async () => {
          throw err;
        },
      }),
    });
    const res = await getMe(req, mockAuth, () => container);

    expect(container.items.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'Ada', email: 'ada@example.com' }),
    );
    expect(res.status).toBe(200);
    expect(res.jsonBody.id).toBe('u1');
  });

  test('creates user when read returns resource undefined (no throw)', async () => {
    const container = makeContainer({
      item: vi.fn().mockReturnValue({
        read: async () => ({ statusCode: 404, resource: undefined }),
      }),
    });
    const res = await getMe(req, mockAuth, () => container);

    expect(container.items.create).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  test('re-throws non-404 Cosmos errors', async () => {
    const err = Object.assign(new Error('Service unavailable'), { code: 503 });
    const container = makeContainer({
      item: vi.fn().mockReturnValue({
        read: async () => {
          throw err;
        },
      }),
    });

    await expect(getMe(req, mockAuth, () => container)).rejects.toThrow('Service unavailable');
  });

  test('returns 401 when auth fails', async () => {
    const authFail = async () => null;
    const container = makeContainer();
    const res = await getMe(req, authFail, () => container);

    expect(res.status).toBe(401);
    expect(container.item).not.toHaveBeenCalled();
  });
});
