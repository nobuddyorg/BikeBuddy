'use strict';

const { updateProfile } = require('./index');

const mockAuth = async () => ({ userId: 'u1', userEmail: 'ada@example.com' });
const reqWith = (body) => ({ json: async () => body });

function makeContainer(
  existing = { id: 'u1', name: null, email: 'ada@example.com', createdAt: 'x' },
) {
  const upsert = vi.fn((doc) => Promise.resolve({ resource: doc }));
  const item = vi.fn().mockReturnValue({ read: async () => ({ resource: existing }) });
  return { container: { item, items: { upsert } }, upsert, item };
}

describe('PATCH /api/me', () => {
  it('returns 401 when auth fails', async () => {
    const res = await updateProfile(
      reqWith({ name: 'Ada' }),
      async () => null,
      () => makeContainer().container,
    );
    expect(res.status).toBe(401);
  });

  it('updates the stored name and returns the doc', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith({ name: 'Ada Lovelace' }), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(c.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'Ada Lovelace' }),
    );
    expect(res.jsonBody.name).toBe('Ada Lovelace');
  });

  it('strips HTML from the name', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith({ name: '<b>Ada</b>' }), mockAuth, () => c.container);
    expect(res.jsonBody.name).toBe('bAda/b');
  });

  it('rejects an empty name', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith({ name: '   ' }), mockAuth, () => c.container);
    expect(res.status).toBe(400);
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('creates the doc when it does not exist yet', async () => {
    const c = makeContainer(undefined);
    const res = await updateProfile(reqWith({ name: 'New User' }), mockAuth, () => c.container);
    expect(res.status).toBe(200);
    expect(c.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'New User', email: 'ada@example.com' }),
    );
  });
});
