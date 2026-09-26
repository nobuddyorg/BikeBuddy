'use strict';

const { connectHarness } = require('./harness');

let anonymous;

beforeAll(async () => {
  ({ anonymous } = await connectHarness());
});

describe('GET /api/health', () => {
  it('returns 200 with an ok payload, without a token', async () => {
    const response = await anonymous.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
