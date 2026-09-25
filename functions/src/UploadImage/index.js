'use strict';

const { app } = require('../lib/functionsApp');
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
const { error } = require('../lib/http');

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
    return { response: error(400, 'Only JPEG or PNG images are accepted') };
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
    blobStorage.uploadBlob(container, { blobName: name, data, contentType: 'image/jpeg' });
  await withRollback(
    () =>
      settleAll(
        [upload(blobName, variants.full), upload(thumbnailBlobName(blobName), variants.thumbnail)],
        `Uploading the blobs of ${blobName} failed`,
      ),
    () => deleteVariants(container, blobName),
  );
}

// An atomic append, not a replace: concurrent uploads each keep their own entry.
async function appendImageEntry(container, { tourId, userId, image }) {
  const target = { id: tourId, partitionKey: userId };
  try {
    await db.patchItem(container, {
      ...target,
      operations: [{ op: 'add', path: '/images/-', value: image }],
    });
  } catch (patchError) {
    // A tour written before the images field existed: "add" creates the array.
    if (patchError.code !== 400) throw patchError;
    await db.patchItem(container, {
      ...target,
      operations: [{ op: 'add', path: '/images', value: [image] }],
    });
  }
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

  if (tour.images?.length >= MAX_TOUR_IMAGES) {
    return error(400, 'This tour already has the maximum of 20 photos.');
  }
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
  await withRollback(
    () => appendImageEntry(toursContainer(), { tourId: tour.id, userId, image }),
    () => deleteVariants(container, blobName),
  );

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
  handler: (request) => uploadImage(request),
});

module.exports = { uploadImage };
