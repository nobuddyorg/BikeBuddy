'use strict';

// One-off backfill: generates a thumbnail blob for every existing photo that
// doesn't have one yet (predates #466's real-thumbnail work). No Cosmos
// writes needed — the thumbnail's blob name is deterministic from the full
// image's (see lib/thumbBlobName.js), so nothing on the tour document has
// to change. Idempotent and safe to re-run: an image whose thumbnail blob
// already exists is skipped.
//
// Env: COSMOS_CONNECTION_STRING, COSMOS_DATABASE, BLOB_CONNECTION_STRING.
// Usage: node scripts/backfillImageThumbnails.js

const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');
const { resizeThumbnail } = require('../src/lib/resizeImage');
const { thumbBlobName } = require('../src/lib/thumbBlobName');

const connectionString = process.env.COSMOS_CONNECTION_STRING;
const databaseId = process.env.COSMOS_DATABASE || 'bikebuddy';
const blobConnectionString = process.env.BLOB_CONNECTION_STRING;

async function backfillImage(imagesContainer, image) {
  const full = imagesContainer.getBlockBlobClient(image.blobName);
  const thumb = imagesContainer.getBlockBlobClient(thumbBlobName(image.blobName));

  if (await thumb.exists()) return 'skipped';

  let buffer;
  try {
    buffer = await full.downloadToBuffer();
  } catch (err) {
    console.error(`  skip ${image.blobName}: could not download full image (${err.message})`);
    return 'failed';
  }

  let thumbnail;
  try {
    thumbnail = await resizeThumbnail(buffer);
  } catch (err) {
    console.error(`  skip ${image.blobName}: could not generate thumbnail (${err.message})`);
    return 'failed';
  }

  await thumb.uploadData(thumbnail, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } });
  return 'created';
}

async function main() {
  if (!connectionString) throw new Error('COSMOS_CONNECTION_STRING is required');
  if (!blobConnectionString) throw new Error('BLOB_CONNECTION_STRING is required');

  const toursContainer = new CosmosClient(connectionString)
    .database(databaseId)
    .container('tours');
  const imagesContainer = BlobServiceClient.fromConnectionString(
    blobConnectionString,
  ).getContainerClient('tour-images');

  const { resources: tours } = await toursContainer.items
    .query('SELECT c.images FROM c WHERE IS_DEFINED(c.images)')
    .fetchAll();
  const images = tours.flatMap((tour) => tour.images || []);

  console.log(`${images.length} images total.`);

  let created = 0;
  let skipped = 0;
  let failed = 0;
  for (const image of images) {
    const result = await backfillImage(imagesContainer, image);
    if (result === 'created') created++;
    else if (result === 'skipped') skipped++;
    else failed++;
  }

  console.log(`Done: ${created} created, ${skipped} already existed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exitCode = 1;
});
