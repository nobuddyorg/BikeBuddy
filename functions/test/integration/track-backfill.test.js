'use strict';

// Real emulator, real host: a tour stored before #615 reads the same before and after its track
// moves, then gets the sizes an upload records now (#549). One file, so the backfills run in order.

const db = require('../../src/lib/db');
const blobStorage = require('../../src/lib/blobStorage');
const { applyTrackBackfill } = require('../../scripts/lib/trackBackfill');
const { applyStoredBytesBackfill } = require('../../scripts/lib/storedBytesBackfill');
const { plainJpeg } = require('../fixtures/jpegs');
const { connectHarness } = require('./harness');
const { assertEmulatorTargets } = require('./emulatorGuard');

// Two rides a day apart: inline points drew them joined; the rebuilt track breaks the line (#552).
const TWO_RIDES_GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk>
  <trkseg><trkpt lat="48.1" lon="11.5"/><trkpt lat="48.2" lon="11.6"/></trkseg>
  <trkseg><trkpt lat="52.5" lon="13.4"/><trkpt lat="52.51" lon="13.41"/></trkseg>
</trk></gpx>`;

let rider;
let tourId;
let recordedSizes;

const quietLog = { info: () => {}, error: (line) => console.error(line) };

beforeAll(async () => {
  // db.js reads the emulator the host was started against; the guard refuses anything else.
  const targets = assertEmulatorTargets();
  process.env.COSMOS_CONNECTION_STRING = targets.cosmosConnectionString;
  process.env.BLOB_CONNECTION_STRING = targets.blobConnectionString;
  process.env.COSMOS_DATABASE ??= 'bikebuddy';
  rider = (await connectHarness()).newUser();
  tourId = await rider.api.createTour({ name: 'Stored before #615', gpx: TWO_RIDES_GPX });
  await rider.api.addPhoto({ tourId, jpeg: await plainJpeg() });

  // Rewrite it into the old shape: points inline, no sizes, version 1, no track item.
  const { userId } = rider;
  const tour = await db.readItem(db.toursContainer(), { id: tourId, partitionKey: userId });
  const track = await db.readItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
  const { pointCount, gpxBytes, ...withoutCount } = tour;
  recordedSizes = { gpxBytes, imageBytes: tour.images.map((image) => image.bytes) };
  await db.upsertItem(db.toursContainer(), {
    ...withoutCount,
    schemaVersion: 1,
    heatmapData: track.heatmapData,
    images: tour.images.map((image) => ({ ...image, bytes: undefined })),
  });
  await db.deleteItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
  expect(pointCount).toBe(track.heatmapData.length);
}, 60_000);

afterAll(async () => {
  await rider?.api.deleteAccount();
});

describe('backfillTracks against the emulator', () => {
  test('moves the points to a track item rebuilt from the GPX, and the API answers the same points', async () => {
    const { userId } = rider;
    const before = await rider.api.readJson(`/tours/${tourId}`);
    const [mapBefore] = await rider.api.readJson('/map');
    expect(before.segmentStarts).toEqual([]);

    await applyTrackBackfill({
      toursContainer: db.toursContainer(),
      tracksContainer: db.tracksContainer(),
      gpxContainer: await blobStorage.gpxContainer(),
      log: quietLog,
    });

    const tour = await db.readItem(db.toursContainer(), { id: tourId, partitionKey: userId });
    const track = await db.readItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
    expect(tour).not.toHaveProperty('heatmapData');
    expect(tour).toMatchObject({ schemaVersion: 2, pointCount: before.heatmapData.length });
    expect(track).toMatchObject({
      id: tourId,
      userId,
      heatmapData: before.heatmapData,
      segmentStarts: [2],
    });
    const after = await rider.api.readJson(`/tours/${tourId}`);
    expect(after).toMatchObject({ heatmapData: before.heatmapData, segmentStarts: [2] });
    const [mapAfter] = await rider.api.readJson('/map');
    expect(mapAfter).toMatchObject({ heatmapData: mapBefore.heatmapData, segmentStarts: [2] });
  });

  test('then records the sizes the upload had recorded, read from the blobs (#549)', async () => {
    const { userId } = rider;
    expect(recordedSizes.gpxBytes).toBe(Buffer.byteLength(TWO_RIDES_GPX));
    expect(recordedSizes.imageBytes).toEqual([expect.any(Number)]);

    await applyStoredBytesBackfill({
      toursContainer: db.toursContainer(),
      gpxContainer: await blobStorage.gpxContainer(),
      imagesContainer: await blobStorage.imagesContainer(),
      log: quietLog,
    });

    const tour = await db.readItem(db.toursContainer(), { id: tourId, partitionKey: userId });
    expect(tour).toMatchObject({ schemaVersion: 3, gpxBytes: recordedSizes.gpxBytes });
    expect(tour.images.map((image) => image.bytes)).toEqual(recordedSizes.imageBytes);
  });
});
