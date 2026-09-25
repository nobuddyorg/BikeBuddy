'use strict';

const { randomUUID } = require('node:crypto');
const { ISO_TIMESTAMP_PATTERN } = require('./api');
const { connectHarness } = require('./harness');

let rider;

beforeAll(async () => {
  rider = (await connectHarness()).newUser();
});

afterAll(async () => {
  await rider?.api.deleteAccount();
});

const patchProfile = (body) => rider.api.sendJson('/me', { method: 'PATCH', body });

describe('GET /api/me', () => {
  it("provisions the caller from the token's claims", async () => {
    const response = await rider.api.request('/me');
    expect(response.status).toBe(200);

    const me = await response.json();
    expect(me.id).toBe(rider.userId);
    expect(me.email).toBe(`${rider.userId}@integration.test`);
    expect(me.name).toBe('Integration Rider');
    expect(me.createdAt).toMatch(ISO_TIMESTAMP_PATTERN);
    for (const key of ['_rid', '_self', '_etag', '_ts']) expect(me).not.toHaveProperty(key);
  });

  it('keeps a name chosen with PATCH /api/me on every later GET (#551)', async () => {
    const chosen = `Chosen ${randomUUID()}`;
    expect((await patchProfile({ name: chosen })).status).toBe(200);

    const first = await rider.api.readJson('/me');
    const second = await rider.api.readJson('/me');

    expect(first.name).toBe(chosen);
    expect(second.name).toBe(chosen);
  });
});
