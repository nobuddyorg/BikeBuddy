'use strict';

const getMe = require('./index');

const STORED_USER = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockAuth = vi.fn(async () => true);

function makeContext() {
  return { res: null, userId: 'u1', userEmail: 'ada@example.com', userName: 'Ada' };
}

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
    const ctx = makeContext();
    await getMe(ctx, {}, mockAuth, () => container);

    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body).toEqual(STORED_USER);
  });

  test('creates user document on first login (404)', async () => {
    const err = Object.assign(new Error('Not found'), { code: 404 });
    const container = makeContainer({
      item: vi.fn().mockReturnValue({ read: async () => { throw err; } }),
    });
    const ctx = makeContext();
    await getMe(ctx, {}, mockAuth, () => container);

    expect(container.items.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'Ada', email: 'ada@example.com' }),
    );
    expect(ctx.res.status).toBe(200);
    expect(ctx.res.body.id).toBe('u1');
  });

  test('re-throws non-404 Cosmos errors', async () => {
    const err = Object.assign(new Error('Service unavailable'), { code: 503 });
    const container = makeContainer({
      item: vi.fn().mockReturnValue({ read: async () => { throw err; } }),
    });

    await expect(getMe(makeContext(), {}, mockAuth, () => container)).rejects.toThrow('Service unavailable');
  });

  test('returns 401 when auth fails', async () => {
    const authFail = vi.fn(async (ctx) => {
      ctx.res = { status: 401, body: { error: 'Unauthorized' } };
      return false;
    });
    const container = makeContainer();
    const ctx = makeContext();
    await getMe(ctx, {}, authFail, () => container);

    expect(ctx.res.status).toBe(401);
    expect(container.item).not.toHaveBeenCalled();
  });
});
