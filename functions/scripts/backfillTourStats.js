'use strict';

// One-off backfill: computes elevation gain/loss, min/max elevation,
// duration and average speed for tours uploaded before #452, by re-parsing
// each tour's already-stored GPX blob. Idempotent and safe to re-run — a
// tour is skipped once elevationGain is no longer undefined (undefined vs
// null is what distinguishes "not yet migrated" from "migrated, GPX had no
// elevation data").
//
// Env: COSMOS_CONNECTION_STRING, COSMOS_DATABASE, BLOB_CONNECTION_STRING.
// Usage: node scripts/backfillTourStats.js

const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const { parseGpx } = require('../src/lib/parseGpx');

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE || 'bikebuddy';
const blobConnectionString = process.env.BLOB_CONNECTION_STRING;

const STAT_FIELDS = [
  'elevationGain',
  'elevationLoss',
  'minElevation',
  'maxElevation',
  'durationSeconds',
  'movingSeconds',
  'avgSpeed',
];

async function backfillTour(container, gpxContainer, tour) {
  const blockBlob = gpxContainer.getBlockBlobClient(`${tour.userId}/${tour.id}.gpx`);

  let buffer;
  try {
    buffer = await blockBlob.downloadToBuffer();
  } catch (err) {
    console.error(`  skip ${tour.id}: could not download GPX blob (${err.message})`);
    return false;
  }

  let parsed;
  try {
    parsed = parseGpx(buffer);
  } catch (err) {
    console.error(`  skip ${tour.id}: could not parse GPX (${err.message})`);
    return false;
  }

  const operations = STAT_FIELDS.map((field) => ({
    op: 'set',
    path: `/${field}`,
    value: parsed[field] ?? null,
  }));
  await container.item(tour.id, tour.userId).patch(operations);
  return true;
}

async function main() {
  if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING is required');
  if (!blobConnectionString) throw new Error('BLOB_CONNECTION_STRING is required');

  const container = new CosmosClient(connectionString).database(databaseId).container('tours');
  const gpxContainer = BlobServiceClient.fromConnectionString(
    blobConnectionString,
  ).getContainerClient('gpx-files');

  const { resources: tours } = await container.items.query('SELECT * FROM c').fetchAll();
  const pending = tours.filter((tour) => tour.elevationGain === undefined);

  console.log(`${tours.length} tours total, ${pending.length} need backfilling.`);

  let migrated = 0;
  let failed = 0;
  for (const tour of pending) {
    const ok = await backfillTour(container, gpxContainer, tour);
    if (ok) migrated++;
    else failed++;
  }

  console.log(`Done: ${migrated} migrated, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exitCode = 1;
});
