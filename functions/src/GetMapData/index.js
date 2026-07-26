'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, queryUserItems } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');

const isGeotagged = (img) => typeof img.lat === 'number' && typeof img.lon === 'number';
const pinnedImages = (tour) => (tour.images || []).filter(isGeotagged);

// GET /api/map — every tour's track points and pinnable photos in one query,
// instead of a detail fetch each (#355). Photos without coordinates can't be
// pinned, so they cost no signature here; the gallery still gets them all.
async function getMapData(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const tours = await queryUserItems(
    getContainer(),
    user.userId,
    'SELECT c.id, c.heatmapData, c.images FROM c WHERE c.userId = @userId',
  );

  const container = tours.some((tour) => pinnedImages(tour).length > 0)
    ? await getImagesContainer()
    : null;

  const jsonBody = await Promise.all(
    tours.map(async (tour) => ({
      id: tour.id,
      heatmapData: tour.heatmapData || [],
      images: await Promise.all(
        pinnedImages(tour).map(async (img) => ({
          id: img.id,
          url: await readSasUrl(container.getBlockBlobClient(img.blobName)),
          lat: img.lat,
          lon: img.lon,
        })),
      ),
    })),
  );

  return { status: 200, jsonBody };
}

app.http('GetMapData', {
  methods: ['get'],
  authLevel: 'anonymous',
  route: 'map',
  /* v8 ignore next */
  handler: (request) => getMapData(request),
});

module.exports = { getMapData };
