'use strict';

const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { resizeImage } = require('../lib/resizeImage');

// Validate by magic bytes (not Content-Type): JPEG = FF D8 FF, PNG = 89 50 4E 47.
function isJpegOrPng(buffer) {
  if (buffer.length < 4) return false;
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return jpeg || png;
}

// POST /api/tours/{tourId}/images — store a resized JPEG and append it to the tour.
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getToursContainer = toursContainer,
  getImagesContainer = imagesContainer,
  parseFile = parseMultipart,
  resize = resizeImage,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;
  const tourId = req.params?.tourId;

  // Ownership: the tour must be in the caller's partition.
  let tour;
  try {
    ({ resource: tour } = await getToursContainer().item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) {
    context.res = { status: 404, body: { error: 'Tour not found' } };
    return;
  }

  let file;
  try {
    file = await parseFile(req);
  } catch (err) {
    context.res = { status: err.status ?? 500, body: { error: err.message } };
    return;
  }

  if (!isJpegOrPng(file.buffer)) {
    context.res = { status: 400, body: { error: 'Only JPEG or PNG images are accepted' } };
    return;
  }

  const resized = await resize(file.buffer);

  const imageId = uuidv4();
  const blobName = `${userId}/${tourId}/${imageId}.jpg`;
  const container = await getImagesContainer();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(resized, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } });

  tour.images = [...(tour.images || []), { id: imageId, blobName }];
  await getToursContainer().item(tourId, userId).replace(tour);

  context.res = {
    status: 201,
    body: { id: imageId, url: await readSasUrl(blockBlob) },
  };
};
