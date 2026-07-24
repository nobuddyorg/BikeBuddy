'use strict';

const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { resizeImage } = require('../lib/resizeImage');
const { extractGps } = require('../lib/extractGps');
const { isImageContentType } = require('../lib/validation');
const { loadOwnedTour } = require('../lib/ownedTour');
const { error } = require('../lib/http');

const MAX_TOUR_IMAGES = 20;

// Validate by magic bytes (not Content-Type): JPEG = FF D8 FF, PNG = 89 50 4E 47.
function isJpegOrPng(buffer) {
  if (buffer.length < 4) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return jpeg || png;
}

// POST /api/tours/{tourId}/images — store a resized JPEG and append it to the tour.
async function uploadImage(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
  parseFile = parseMultipart,
  resize = resizeImage,
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

  // Validate the declared content-type AND the actual magic bytes.
  if (!isImageContentType(file.mimeType) || !isJpegOrPng(file.buffer)) {
    return error(400, 'Only JPEG or PNG images are accepted');
  }

  // Read GPS from the ORIGINAL buffer before resizing re-encodes and drops EXIF.
  const gps = await readGps(file.buffer);
  const resized = await resize(file.buffer);

  const imageId = randomUUID();
  const blobName = `${userId}/${tourId}/${imageId}.jpg`;
  const container = await getImagesContainer();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(resized, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } });

  const image = { id: imageId, blobName, ...(gps && { lat: gps.lat, lon: gps.lon }) };
  // A read-modify-write .replace(tour) here would lose images from concurrent
  // uploads to the same tour (each request's in-memory tour.images snapshot is
  // taken before the async parse/resize/GPS work, so the slower of two
  // requests would overwrite the faster one's array). Append atomically
  // instead — UploadTour always seeds images: [], so /images/- is valid for
  // every tour this app creates.
  const tourItem = getToursContainer().item(tourId, userId);
  try {
    await tourItem.patch([{ op: 'add', path: '/images/-', value: image }]);
  } catch (err) {
    // Only a tour predating the images field (never seeded with []) can hit
    // this — "add" on a path that isn't an existing array creates it instead.
    if (err.code !== 400) throw err;
    await tourItem.patch([{ op: 'add', path: '/images', value: [image] }]);
  }

  return {
    status: 201,
    jsonBody: {
      id: imageId,
      url: await readSasUrl(blockBlob),
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

module.exports = { uploadImage, isJpegOrPng };
