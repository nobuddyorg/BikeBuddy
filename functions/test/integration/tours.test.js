'use strict';

const { randomUUID } = require('node:crypto');
const { UUID_PATTERN, ISO_TIMESTAMP_PATTERN } = require('./api');
const { connectHarness } = require('./harness');

let rider;

beforeAll(async () => {
  rider = (await connectHarness()).newUser();
});

afterAll(async () => {
  await rider?.api.deleteAccount();
});

describe('tours HTTP lifecycle', () => {
  it('uploads → lists → reads → deletes a tour', async () => {
    const name = `Integration ${randomUUID()}`;

    const upload = await rider.api.uploadTour({ name });
    expect(upload.status).toBe(201);
    const { tourId, ...summary } = await upload.json();
    expect(tourId).toMatch(UUID_PATTERN);
    expect(summary).toMatchObject({ name, createdAt: '2026-06-01T10:00:00.000Z' });
    expect(summary).not.toHaveProperty('gpxFileUrl');

    const list = await rider.api.request('/tours');
    expect(list.status).toBe(200);
    const listed = (await list.json()).find((tour) => tour.id === tourId);
    expect(listed).toMatchObject({ id: tourId, name });
    expect(listed.createdAt).toMatch(ISO_TIMESTAMP_PATTERN);
    // List payloads stay small: the track is detail-only.
    expect(listed).not.toHaveProperty('heatmapData');

    const detail = await rider.api.request(`/tours/${tourId}`);
    expect(detail.status).toBe(200);
    const tour = await detail.json();
    expect(tour.name).toBe(name);
    expect(tour.heatmapData).toHaveLength(3);
    expect(tour.images).toEqual([]);
    for (const key of ['userId', '_rid', '_self', '_etag', '_ts']) {
      expect(tour).not.toHaveProperty(key);
    }

    const deleted = await rider.api.request(`/tours/${tourId}`, { method: 'DELETE' });
    expect(deleted.status).toBe(204);
    expect((await rider.api.request(`/tours/${tourId}`)).status).toBe(404);
  });

  it('rejects a non-UUID tour id with 400', async () => {
    const response = await rider.api.request('/tours/not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('rejects a non-GPX upload with 400', async () => {
    const before = await rider.api.readJson('/tours');
    const form = new FormData();
    form.append('file', new Blob(['not xml at all'], { type: 'text/plain' }), 'notes.txt');
    const response = await rider.api.request('/tours/upload?name=Bad', {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
    expect(await rider.api.readJson('/tours')).toEqual(before);
  });

  it('rejects an edit with a body that is not JSON with 400', async () => {
    const tourId = await rider.api.createTour({ name: `Edit ${randomUUID()}` });

    const response = await rider.api.request(`/tours/${tourId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": ',
    });

    expect(response.status).toBe(400);
  });
});
