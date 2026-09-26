'use strict';

// Real emulator, real host: a tour stored before #615 reads the same before and after its track moves.

const db = require('../../src/lib/db');
const { applyTrackBackfill } = require('../../scripts/lib/trackBackfill');
const { connectHarness } = require('./harness');
const { assertEmulatorTargets } = require('./emulatorGuard');

let rider;
let tourId;

const quietLog = { info: () => {}, error: (line) => console.error(line) };

beforeAll(async () => {
  // db.js reads the emulator the host was started against; the guard refuses anything else.
  process.env.COSMOS_CONNECTION_STRING = assertEmulatorTargets().cosmosConnectionString;
  process.env.COSMOS_DATABASE ??= 'bikebuddy';
  rider = (await connectHarness()).newUser();
  tourId = await rider.api.createTour({ name: 'Stored before #615' });

  // Rewrite it into the old shape: points inline, version 1, no track item.
  const { userId } = rider;
  const tour = await db.readItem(db.toursContainer(), { id: tourId, partitionKey: userId });
  const track = await db.readItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
  const { pointCount, ...withoutCount } = tour;
  await db.upsertItem(db.toursContainer(), {
    ...withoutCount,
    schemaVersion: 1,
    heatmapData: track.heatmapData,
  });
  await db.deleteItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
  expect(pointCount).toBe(track.heatmapData.length);
}, 60_000);

afterAll(async () => {
  await rider?.api.deleteAccount();
});

describe('backfillTracks against the emulator', () => {
  test('moves the points to a track item, and the API answers the same track before and after', async () => {
    const { userId } = rider;
    const before = await rider.api.readJson(`/tours/${tourId}`);
    const [mapBefore] = await rider.api.readJson('/map');

    await applyTrackBackfill({
      toursContainer: db.toursContainer(),
      tracksContainer: db.tracksContainer(),
      log: quietLog,
    });

    const tour = await db.readItem(db.toursContainer(), { id: tourId, partitionKey: userId });
    const track = await db.readItem(db.tracksContainer(), { id: tourId, partitionKey: userId });
    expect(tour).not.toHaveProperty('heatmapData');
    expect(tour).toMatchObject({ schemaVersion: 2, pointCount: before.heatmapData.length });
    expect(track).toMatchObject({ id: tourId, userId, heatmapData: before.heatmapData });
    expect((await rider.api.readJson(`/tours/${tourId}`)).heatmapData).toEqual(before.heatmapData);
    expect((await rider.api.readJson('/map'))[0].heatmapData).toEqual(mapBefore.heatmapData);
  });
});
