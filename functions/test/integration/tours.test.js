'use strict';

const { randomUUID } = require('node:crypto');
const { UUID_PATTERN, ISO_TIMESTAMP_PATTERN, SAMPLE_GPX } = require('./api');
const { connectHarness } = require('./harness');
const { plainJpeg } = require('../fixtures/jpegs');
const { MAX_FILE_BYTES } = require('../../src/lib/parseMultipart');

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

  it('refuses a chunked upload over 10 MB, which carries no Content-Length, with 400 (#550)', async () => {
    const before = await rider.api.readJson('/tours');
    const boundary = 'bikebuddy-integration-boundary';
    const megabyte = Buffer.alloc(1024 * 1024, ' ');
    let megabytesSent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (megabytesSent === 0) {
          controller.enqueue(
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="big.gpx"\r\n` +
                'Content-Type: application/gpx+xml\r\n\r\n',
            ),
          );
        }
        if (megabytesSent < 11) {
          controller.enqueue(megabyte);
          megabytesSent += 1;
          return;
        }
        controller.enqueue(Buffer.from(`\r\n--${boundary}--\r\n`));
        controller.close();
      },
    });

    const response = await rider.api.request('/tours/upload?name=Big', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
      duplex: 'half',
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('File exceeds 10 MB limit');
    expect(await rider.api.readJson('/tours')).toEqual(before);
  });

  // fetch declares the whole multipart body, so more than the file's own 10 MB.
  it('accepts a GPX file of exactly 10 MB with its real Content-Length', async () => {
    const padding = MAX_FILE_BYTES - Buffer.byteLength(SAMPLE_GPX) - '<!---->'.length;
    const gpx = `${SAMPLE_GPX}<!--${'x'.repeat(padding)}-->`;
    expect(Buffer.byteLength(gpx)).toBe(MAX_FILE_BYTES);

    const response = await rider.api.uploadTour({ name: `Ten megabytes ${randomUUID()}`, gpx });

    expect(response.status).toBe(201);
  });

  it('never lets concurrent uploads take a tour past 20 photos', async () => {
    const tourId = await rider.api.createTour({ name: `Photo cap ${randomUUID()}` });
    const jpeg = await plainJpeg();
    for (let photo = 0; photo < 18; photo++) await rider.api.addPhoto({ tourId, jpeg });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => rider.api.uploadImage({ tourId, jpeg })),
    );

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 201, 400, 400, 400]);
    const refusals = await Promise.all(
      responses.filter((response) => response.status === 400).map((response) => response.json()),
    );
    expect(refusals).toEqual(
      Array(3).fill({ error: 'This tour already has the maximum of 20 photos.' }),
    );
    expect((await rider.api.readJson(`/tours/${tourId}`)).images).toHaveLength(20);
  }, 60_000);

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
