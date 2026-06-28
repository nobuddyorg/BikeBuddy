'use strict';

const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { resizeImage } = require('../lib/resizeImage');
const { extractGps } = require('../lib/extractGps');
const { uuidParamError, isImageContentType } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

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
  const user = await auth(request);
  if (!user) return unauthorized();

  const tourId = request.params.tourId;
  const badParam = uuidParamError({ tourId });
  if (badParam) return badParam;

  const { userId } = user;

  // Ownership: the tour must be in the caller's partition.
  const tour = await readItem(getToursContainer(), tourId, userId);
  if (!tour) return error(404, 'Tour not found');

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
  tour.images = [...(tour.images || []), image];
  await getToursContainer().item(tourId, userId).replace(tour);

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
  handler: (request) => uploadImage(request),
});

module.exports = { uploadImage, isJpegOrPng };
