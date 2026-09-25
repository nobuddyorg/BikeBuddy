'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { loadOwnedTour } = require('../lib/ownedTour');
const { parseMultipart } = require('../lib/parseMultipart');
const { resizeVariants } = require('../lib/resizeImage');
const { extractGps } = require('../lib/extractGps');
const { imageBlobName, thumbnailBlobName } = require('../lib/blobNames');
const { isJpegOrPng } = require('../lib/fileSignatures');
const { isImageContentType } = require('../lib/validation');
const { toSignedImage } = require('../lib/tourImages');
const { settleAll, withRollback } = require('../lib/settle');
const { ERROR_KEYS, error } = require('../lib/http');

const MAX_TOUR_IMAGES = 20;

async function readImageUpload(request, parseFile) {
  let file;
  try {
    file = await parseFile(request);
  } catch (parseError) {
    if (parseError.status !== 400) throw parseError;
    return { response: error(400, parseError.message) };
  }
  // The declared type and the actual bytes.
  if (!isImageContentType(file.mimeType) || !isJpegOrPng(file.buffer)) {
    return { response: error(400, ERROR_KEYS.imageType) };
  }
  return { file };
}

const deleteVariants = (container, blobName) =>
  settleAll(
    [blobName, thumbnailBlobName(blobName)].map((name) =>
      blobStorage.deleteBlobIfExists(container, name),
    ),
    `Deleting the blobs of ${blobName} failed`,
  );

// Both uploads settle before a failure is reported, so the rollback races no upload.
async function storeVariants(container, { blobName, variants }) {
  const upload = (name, data) =>
    blobStorage.uploadBlob(container, {
      blobName: name,
      data,
      contentType: 'image/jpeg',
      cacheControl: blobStorage.IMMUTABLE_CACHE_CONTROL,
    });
  await withRollback(
    () =>
      settleAll(
        [upload(blobName, variants.full), upload(thumbnailBlobName(blobName), variants.thumbnail)],
        `Uploading the blobs of ${blobName} failed`,
      ),
    () => deleteVariants(container, blobName),
  );
}

// Each 412 means another write landed first; a user's own edits cannot hold an upload forever.
const MAX_APPEND_ATTEMPTS = 10;

const appendOperation = (tour, image) =>
  tour.images
    ? { op: 'add', path: '/images/-', value: image }
    : // A tour written before the images field existed.
      { op: 'add', path: '/images', value: [image] };

async function tryAppend(container, { current, tourId, userId, image }) {
  if (!current) return 'gone';
  if ((current.images?.length ?? 0) >= MAX_TOUR_IMAGES) return 'full';
  try {
    await db.patchItem(container, {
      id: tourId,
      partitionKey: userId,
      etag: current._etag,
      operations: [appendOperation(current, image)],
    });
    return 'appended';
  } catch (patchError) {
    if (patchError.code === 404) return 'gone';
    if (patchError.code === 412) return 'conflict';
    throw patchError;
  }
}

/**
 * An atomic append guarded by the ETag of the tour it counted, so concurrent uploads cannot pass
 * the cap together; on a conflict it reads the tour again and counts again.
 *
 * @returns {Promise<'appended' | 'full' | 'gone'>}
 */
async function appendImageEntry(container, { tour, userId, image }) {
  const target = { tourId: tour.id, userId, image };
  let current = tour;
  for (let attempt = 1; ; attempt++) {
    const outcome = await tryAppend(container, { ...target, current });
    if (outcome !== 'conflict') return outcome;
    if (attempt === MAX_APPEND_ATTEMPTS) {
      throw new Error(`Precondition failed ${MAX_APPEND_ATTEMPTS} times appending to ${tour.id}`);
    }
    current = await db.readItem(container, { id: tour.id, partitionKey: userId });
  }
}

const REFUSALS = {
  full: () => error(400, ERROR_KEYS.tourImageLimit),
  gone: () => error(404, ERROR_KEYS.tourNotFound),
};

// A refused append leaves blobs no entry points to, so it rolls them back like a failed one.
async function recordImage(container, { tour, userId, image, rollback }) {
  const outcome = await withRollback(
    () => appendImageEntry(container, { tour, userId, image }),
    rollback,
  );
  if (outcome === 'appended') return {};
  await rollback();
  return { response: REFUSALS[outcome]() };
}

async function uploadImage(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    imagesContainer = blobStorage.imagesContainer,
    parseFile = parseMultipart,
    resize = resizeVariants,
    readGps = extractGps,
    newId = system.newId,
    now = system.currentTime,
  } = {},
) {
  const guard = await loadOwnedTour(request, { authenticate, toursContainer });
  if (guard.response) return guard.response;
  const { tour } = guard;
  const { userId } = guard.user;

  if (tour.images?.length >= MAX_TOUR_IMAGES) return error(400, ERROR_KEYS.tourImageLimit);
  const upload = await readImageUpload(request, parseFile);
  if (upload.response) return upload.response;

  // Only the original still has EXIF; nothing mutates the buffer, so both read it at once.
  const [gps, variants] = await Promise.all([
    readGps(upload.file.buffer),
    resize(upload.file.buffer),
  ]);
  const imageId = newId();
  const blobName = imageBlobName({ userId, tourId: tour.id, imageId });
  const container = await imagesContainer();
  await storeVariants(container, { blobName, variants });

  const image = { id: imageId, blobName, ...(gps && { lat: gps.lat, lon: gps.lon }) };
  const recorded = await recordImage(toursContainer(), {
    tour,
    userId,
    image,
    rollback: () => deleteVariants(container, blobName),
  });
  if (recorded.response) return recorded.response;

  const requestTime = now();
  const signUrl = (name) => blobStorage.readSasUrl(container, { blobName: name, now: requestTime });
  return {
    status: 201,
    jsonBody: await toSignedImage(image, { userId, tourId: tour.id, signUrl }),
  };
}

app.http('UploadImage', {
  methods: ['post'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}/images',
  /* v8 ignore next */
  handler: withFailureResponse((request) => uploadImage(request)),
});

module.exports = { uploadImage, MAX_TOUR_IMAGES };
