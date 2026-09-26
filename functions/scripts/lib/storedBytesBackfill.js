'use strict';

const { gpxBlobName, imageBlobName, thumbnailBlobName } = require('../../src/lib/blobNames');
const { queryItems } = require('./queryItems');
const { runBackfill } = require('./cli');

// Version 2 (the track moved, trackBackfill.js); recording the sizes makes it 3 (#549).
const TRACKS_SCHEMA_VERSION = 2;
const STORED_BYTES_SCHEMA_VERSION = 3;
const PENDING_TOURS_QUERY =
  'SELECT c.id, c.userId, c.images, c._etag FROM c ' +
  `WHERE c.schemaVersion = ${TRACKS_SCHEMA_VERSION}`;

// A blob that is gone stores nothing, so it counts as nothing.
async function sizeOf(container, blobName) {
  try {
    return (await container.getBlockBlobClient(blobName).getProperties()).contentLength;
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    return 0;
  }
}

// Blob names from the tour's own ids, as a delete names them, never from a stored name.
async function imageWithBytes({ tour, image, imagesContainer }) {
  const blobName = imageBlobName({ userId: tour.userId, tourId: tour.id, imageId: image.id });
  const [full, thumbnail] = await Promise.all([
    sizeOf(imagesContainer, blobName),
    sizeOf(imagesContainer, thumbnailBlobName(blobName)),
  ]);
  return { ...image, bytes: full + thumbnail };
}

async function changeFor({ tour, gpxContainer, imagesContainer }) {
  const [gpxBytes, images] = await Promise.all([
    sizeOf(gpxContainer, gpxBlobName({ userId: tour.userId, tourId: tour.id })),
    Promise.all(
      (tour.images ?? []).map((image) => imageWithBytes({ tour, image, imagesContainer })),
    ),
  ]);
  const photoBytes = images.reduce((sum, image) => sum + image.bytes, 0);
  return {
    // Three operations, whatever the photo count: a patch takes at most ten.
    operations: [
      { op: 'set', path: '/gpxBytes', value: gpxBytes },
      { op: 'set', path: '/images', value: images },
      { op: 'set', path: '/schemaVersion', value: STORED_BYTES_SCHEMA_VERSION },
    ],
    description:
      `record the sizes of tour ${tour.id} (GPX ${gpxBytes} bytes, ` +
      `${images.length} photo(s) ${photoBytes} bytes)`,
  };
}

async function forEachPendingTour({ toursContainer, gpxContainer, imagesContainer, log, handle }) {
  const tally = { changed: 0, failed: 0 };
  for await (const tour of queryItems(toursContainer, PENDING_TOURS_QUERY)) {
    try {
      await handle(tour, await changeFor({ tour, gpxContainer, imagesContainer }));
      tally.changed += 1;
    } catch (error) {
      tally.failed += 1;
      log.error(`Tour ${tour.id}: ${error.message}`);
    }
  }
  return tally;
}

async function planStoredBytesBackfill({ toursContainer, gpxContainer, imagesContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    imagesContainer,
    log,
    handle: async (tour, { description }) => log.info(`Would ${description}`),
  });
  log.info(
    `Dry run, nothing changed: ${tally.changed} tour(s) would change, ${tally.failed} failed.`,
  );
  return tally;
}

// Conditional on the ETag read: a photo added meanwhile fails the tour (412), and a rerun takes it.
async function applyStoredBytesBackfill({ toursContainer, gpxContainer, imagesContainer, log }) {
  const tally = await forEachPendingTour({
    toursContainer,
    gpxContainer,
    imagesContainer,
    log,
    handle: async (tour, { operations, description }) => {
      await toursContainer.item(tour.id, tour.userId).patch(operations, {
        accessCondition: { type: 'IfMatch', condition: tour._etag },
      });
      log.info(`Done: ${description}`);
    },
  });
  log.info(`Done: ${tally.changed} tour(s) changed, ${tally.failed} failed.`);
  return tally;
}

function runStoredBytesBackfill(options) {
  return runBackfill({
    ...options,
    plan: planStoredBytesBackfill,
    apply: applyStoredBytesBackfill,
  });
}

module.exports = { planStoredBytesBackfill, applyStoredBytesBackfill, runStoredBytesBackfill };
