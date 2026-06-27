'use strict';

const { health } = require('./index');

describe('GET /api/health', () => {
  it('returns 200 { status: ok } with no auth and no arguments', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({ status: 'ok' });
  });
});
