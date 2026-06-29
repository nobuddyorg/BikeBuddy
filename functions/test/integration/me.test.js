'use strict';

const BASE = 'http://localhost:7071/api';

// SKIP_AUTH=true → the middleware supplies a deterministic local dev user, and
// GET /api/me provisions + returns that user record.
describe('GET /api/me', () => {
  it('provisions and returns the signed-in user', async () => {
    const res = await fetch(`${BASE}/me`);
    expect(res.status).toBe(200);

    const me = await res.json();
    expect(me.id).toBeTruthy();
    expect(me.email).toContain('@');
    expect(me.createdAt).toBeTruthy();
  });
});
