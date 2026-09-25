'use strict';

// Every URL the API hands out reads exactly one blob under the caller's prefix (#620).

const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { BASE, SAMPLE_GPX, uploadTour, uploadImage, deleteTour } = require('./api');

const CONTAINERS = new Set(['gpx-files', 'tour-images']);

// Azurite serves path-style URLs: /<account>/<container>/<blob name>.
function blobNameOf(url) {
  const segments = new URL(url).pathname.split('/').map(decodeURIComponent);
  const container = segments.findIndex((segment) => CONTAINERS.has(segment));
  return segments.slice(container + 1).join('/');
}

async function createTourWithPhoto() {
  const upload = await uploadTour({ name: `Signed URLs ${randomUUID()}` });
  expect(upload.status).toBe(201);
  const { tourId } = await upload.json();
  const jpeg = await sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 50, b: 10 } },
  })
    .jpeg()
    .toBuffer();
  const image = await uploadImage({ tourId, jpeg });
  expect(image.status).toBe(201);
  const detail = await fetch(`${BASE}/tours/${tourId}`);
  expect(detail.status).toBe(200);
  return { tourId, tour: await detail.json() };
}

describe('signed blob URLs', () => {
  const created = [];
  let userId;
  let tour;

  beforeAll(async () => {
    const me = await fetch(`${BASE}/me`);
    expect(me.status).toBe(200);
    userId = (await me.json()).id;
    const result = await createTourWithPhoto();
    created.push(result.tourId);
    tour = result.tour;
  }, 60_000);

  afterAll(async () => {
    for (const tourId of created) await deleteTour(tourId);
  });

  const urlsOf = (detail) => [
    detail.gpxFileUrl,
    ...detail.images.flatMap((image) => [image.url, image.thumbUrl]),
  ];

  it("names only blobs under the caller's own prefix", () => {
    const urls = urlsOf(tour);

    expect(urls).toHaveLength(3);
    for (const url of urls) expect(blobNameOf(url).split('/')[0]).toBe(userId);
    expect(blobNameOf(tour.gpxFileUrl)).toBe(`${userId}/${tour.id}.gpx`);
  });

  it('reads the blob it names', async () => {
    const gpx = await fetch(tour.gpxFileUrl);
    const photo = await fetch(tour.images[0].url);

    expect(gpx.status).toBe(200);
    expect(await gpx.text()).toBe(SAMPLE_GPX);
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toBe('image/jpeg');
  });

  it('refuses a write to the blob it names', async () => {
    const response = await fetch(tour.gpxFileUrl, {
      method: 'PUT',
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/gpx+xml' },
      body: '<gpx/>',
    });

    expect(response.status).toBe(403);
    expect(await (await fetch(tour.gpxFileUrl)).text()).toBe(SAMPLE_GPX);
  });

  it('refuses to read a sibling blob with the same signature', async () => {
    const photo = new URL(tour.images[0].url);
    const thumbnail = new URL(tour.images[0].thumbUrl);
    photo.pathname = thumbnail.pathname;

    const response = await fetch(photo);

    expect(response.status).toBe(403);
  });

  it('stops reading once the tour is deleted: its GPX, photos and thumbnails are gone (#553)', async () => {
    const { tourId, tour: doomed } = await createTourWithPhoto();
    created.push(tourId);
    const urls = urlsOf(doomed);
    for (const url of urls) expect((await fetch(url)).status).toBe(200);

    expect(await deleteTour(tourId)).toBe(204);

    for (const url of urls) expect((await fetch(url)).status).toBe(404);
  }, 60_000);
});
