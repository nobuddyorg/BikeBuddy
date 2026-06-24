'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// GET /api/tours/{tourId} — full tour document including heatmapData. Reading
// with the userId partition key enforces ownership (another user's tour isn't
// found → 404). Stored images { id, blobName } are returned as { id, url } with
// a short-lived read SAS URL so the private container can be served directly.
async function getTour(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const tourId = request.params.tourId;
  const badParam = uuidParamError({ tourId });
  if (badParam) return badParam;

  const tour = await readItem(getContainer(), tourId, user.userId);
  if (!tour) return error(404, 'Tour not found');

  if (tour.images?.length) {
    const container = await getImagesContainer();
    tour.images = await Promise.all(
      tour.images.map(async (img) => ({
        id: img.id,
        url: await readSasUrl(container.getBlockBlobClient(img.blobName)),
      })),
    );
  } else {
    tour.images = [];
  }

  return { status: 200, jsonBody: tour };
}

app.http('GetTour', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  handler: (request) => getTour(request),
});

module.exports = { getTour };
