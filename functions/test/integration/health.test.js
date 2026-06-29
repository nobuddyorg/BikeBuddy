'use strict';

const BASE = 'http://localhost:7071/api';

describe('GET /api/health', () => {
  it('returns 200 with an ok payload', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
