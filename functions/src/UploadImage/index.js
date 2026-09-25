'use strict';

const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { resizeVariants } = require('../lib/resizeImage');
const { isJpegOrPng } = require('../lib/fileSignatures');
const { thumbnailBlobName } = require('../lib/blobNames');
const { extractGps } = require('../lib/extractGps');
const { isImageContentType } = require('../lib/validation');
const { loadOwnedTour } = require('../lib/ownedTour');
const { error } = require('../lib/http');

const MAX_TOUR_IMAGES = 20;

// POST /api/tours/{tourId}/images — store a resized JPEG (plus a thumbnail
// variant) and append it to the tour.
async function uploadImage(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
  parseFile = parseMultipart,
  resize = resizeVariants,
  readGps = extractGps,
) {
  const guard = await loadOwnedTour(request, auth, getToursContainer);
  if (guard.response) return guard.response;

  const { userId } = guard.user;
  const { tour } = guard;
  const { tourId } = request.params;

  if ((tour.images || []).length >= MAX_TOUR_IMAGES) {
    return error(400, 'This tour already has the maximum of 20 photos.');
  }

  let file;
  try {
    file = await parseFile(request);
  } catch (err) {
    return error(err.status ?? 500, err.message);
  }

  // The declared type AND the actual bytes.
  if (!isImageContentType(file.mimeType) || !isJpegOrPng(file.buffer)) {
    return error(400, 'Only JPEG or PNG images are accepted');
  }

  // The resize re-encodes and drops EXIF, so GPS can only come from the original
  // buffer. Nothing mutates it, so both can read it at once.
  const [gps, { full, thumbnail }] = await Promise.all([readGps(file.buffer), resize(file.buffer)]);

  const imageId = randomUUID();
  const blobName = `${userId}/${tourId}/${imageId}.jpg`;
  const container = await getImagesContainer();
  const blockBlob = container.getBlockBlobClient(blobName);
  const thumbBlockBlob = container.getBlockBlobClient(thumbnailBlobName(blobName));
  await Promise.all([
    blockBlob.uploadData(full, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } }),
    thumbBlockBlob.uploadData(thumbnail, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } }),
  ]);

  const image = { id: imageId, blobName, ...(gps && { lat: gps.lat, lon: gps.lon }) };
  // Each request's tour.images snapshot predates its own parse/resize work, so
  // a read-modify-write .replace() would lose a concurrent upload's image.
  // UploadTour always seeds images: [], so '/images/-' is valid here.
  const tourItem = getToursContainer().item(tourId, userId);
  try {
    await tourItem.patch([{ op: 'add', path: '/images/-', value: image }]);
  } catch (err) {
    // Only reachable for a tour predating the images field: "add" on a path
    // that isn't an existing array creates it instead.
    if (err.code !== 400) throw err;
    await tourItem.patch([{ op: 'add', path: '/images', value: [image] }]);
  }

  const [url, thumbUrl] = await Promise.all([readSasUrl(blockBlob), readSasUrl(thumbBlockBlob)]);
  return {
    status: 201,
    jsonBody: {
      id: imageId,
      url,
      thumbUrl,
      ...(gps && { lat: gps.lat, lon: gps.lon }),
    },
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
