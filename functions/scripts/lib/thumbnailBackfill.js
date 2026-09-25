'use strict';

const { resizeThumbnail } = require('../../src/lib/resizeImage');
const { thumbBlobName } = require('../../src/lib/thumbBlobName');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

const TOUR_IMAGES_QUERY = 'SELECT c.images FROM c WHERE IS_ARRAY(c.images)';

async function* imageBlobNames(toursContainer) {
  for await (const { images } of queryItems(toursContainer, TOUR_IMAGES_QUERY)) {
    for (const { blobName } of images) yield blobName;
  }
}

async function backfillImage({ blobName, imagesContainer, handleThumbnail }) {
  const thumbnailBlob = imagesContainer.getBlockBlobClient(thumbBlobName(blobName));
  if (await thumbnailBlob.exists()) return 'skipped';
  const image = await imagesContainer.getBlockBlobClient(blobName).downloadToBuffer();
  await handleThumbnail(thumbnailBlob, await resizeThumbnail(image));
  return 'changed';
}

async function forEachImage({ toursContainer, imagesContainer, log, handleThumbnail }) {
  const tally = { changed: 0, skipped: 0, failed: 0 };
  for await (const blobName of imageBlobNames(toursContainer)) {
    try {
      tally[await backfillImage({ blobName, imagesContainer, handleThumbnail })] += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Image ${blobName}: ${error.message}`);
    }
  }
  return tally;
}

async function planThumbnailBackfill({ toursContainer, imagesContainer, log }) {
  const tally = await forEachImage({
    toursContainer,
    imagesContainer,
    log,
    handleThumbnail: async (thumbnailBlob) => log.info(`Would create ${thumbnailBlob.name}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} thumbnail(s) would be created, ` +
      `${tally.skipped} already exist, ${tally.failed} failed.`,
  );
  return tally;
}

async function applyThumbnailBackfill({ toursContainer, imagesContainer, log }) {
  const tally = await forEachImage({
    toursContainer,
    imagesContainer,
    log,
    handleThumbnail: async (thumbnailBlob, thumbnail) => {
      await thumbnailBlob.uploadData(thumbnail, {
        blobHTTPHeaders: { blobContentType: 'image/jpeg' },
      });
      log.info(`Created ${thumbnailBlob.name}`);
    },
  });
  log.info(
    `Done: ${tally.changed} thumbnail(s) created, ${tally.skipped} already existed, ` +
      `${tally.failed} failed.`,
  );
  return tally;
}

function runThumbnailBackfill(options) {
  return runBackfill({ ...options, plan: planThumbnailBackfill, apply: applyThumbnailBackfill });
}

module.exports = { planThumbnailBackfill, applyThumbnailBackfill, runThumbnailBackfill };
