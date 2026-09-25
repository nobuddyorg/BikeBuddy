'use strict';

const { randomUUID } = require('node:crypto');
const { BASE, ISO_TIMESTAMP_PATTERN } = require('./api');

const patchProfile = (body) =>
  fetch(`${BASE}/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Under SKIP_AUTH the middleware signs every request in as one dev user.
describe('GET /api/me', () => {
  it('provisions and returns the signed-in user', async () => {
    const response = await fetch(`${BASE}/me`);
    expect(response.status).toBe(200);

    const me = await response.json();
    expect(me.id).toMatch(/^[\w-]+$/);
    expect(me.email).toMatch(/^[^\s@]+@[^\s@]+$/);
    expect(me.createdAt).toMatch(ISO_TIMESTAMP_PATTERN);
    for (const key of ['_rid', '_self', '_etag', '_ts']) expect(me).not.toHaveProperty(key);
  });

  it('keeps a name chosen with PATCH /api/me on every later GET (#551)', async () => {
    const before = await (await fetch(`${BASE}/me`)).json();
    const chosen = `Chosen ${randomUUID()}`;
    try {
      expect((await patchProfile({ name: chosen })).status).toBe(200);

      const first = await (await fetch(`${BASE}/me`)).json();
      const second = await (await fetch(`${BASE}/me`)).json();

      expect(first.name).toBe(chosen);
      expect(second.name).toBe(chosen);
    } finally {
      // The profile is shared by every spec under SKIP_AUTH; put its name back.
      if (before.name) expect((await patchProfile({ name: before.name })).status).toBe(200);
    }
  });
});
