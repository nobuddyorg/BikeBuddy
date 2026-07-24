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
    expect(res.jsonBody.error).toBe(
      'A name (1–200 characters) or a supported language is required.',
    );
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('creates the doc when it does not exist yet', async () => {
    const c = makeContainer(null);
    const res = await updateProfile(reqWith({ name: 'New User' }), mockAuth, () => c.container);
    expect(res.status).toBe(200);
    expect(c.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'New User', email: 'ada@example.com' }),
    );
  });

  it('updates the stored language and returns it, leaving name untouched', async () => {
    const c = makeContainer({ id: 'u1', name: 'Ada', email: 'ada@example.com', createdAt: 'x' });
    const res = await updateProfile(reqWith({ language: 'de' }), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(c.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: 'Ada', language: 'de' }),
    );
    expect(res.jsonBody.language).toBe('de');
    expect(res.jsonBody.name).toBe('Ada');
  });

  it('updates only the name, leaving the stored language untouched', async () => {
    const c = makeContainer({ id: 'u1', name: 'Old', email: 'ada@example.com', language: 'de' });
    const res = await updateProfile(reqWith({ name: 'New Name' }), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(res.jsonBody.language).toBe('de');
    expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({ language: 'de' }));
  });

  it('rejects an unsupported language code', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith({ language: 'xx' }), mockAuth, () => c.container);
    expect(res.status).toBe(400);
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('rejects a body with neither name nor language', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith({}), mockAuth, () => c.container);
    expect(res.status).toBe(400);
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('treats a null JSON body as empty and rejects it', async () => {
    const c = makeContainer();
    const res = await updateProfile(reqWith(null), mockAuth, () => c.container);
    expect(res.status).toBe(400);
    expect(c.upsert).not.toHaveBeenCalled();
  });

  it('creates the doc with a null name when only language is provided for a new user', async () => {
    const c = makeContainer(null);
    const res = await updateProfile(reqWith({ language: 'fr' }), mockAuth, () => c.container);

    expect(res.status).toBe(200);
    expect(c.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', name: null, email: 'ada@example.com', language: 'fr' }),
    );
  });
});
