'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, queryUserItems } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { thumbnailBlobName } = require('../lib/blobNames');
const { unauthorized } = require('../lib/http');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { budgetHeatmapData, TOTAL_POINT_BUDGET, MAX_GAP_METERS } = require('../lib/mapBudget');
const { geotaggedImages } = require('../lib/tourImages');

const defaultHeatmapCache = createHeatmapCache();

// GET /api/map — every tour's track points and pinnable photos in one query,
// instead of a detail fetch each. Photos without coordinates can't be
// pinned, so they cost no signature here; the gallery still gets them all.
async function getMapData(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
  totalPointBudget = TOTAL_POINT_BUDGET,
  maxGapMeters = MAX_GAP_METERS,
  heatmapCache = defaultHeatmapCache,
) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const tours = await queryUserItems(
    getContainer(),
    user.userId,
    'SELECT c.id, c.heatmapData, c.images FROM c WHERE c.userId = @userId',
  );

  const container = tours.some((tour) => geotaggedImages(tour).length > 0)
    ? await getImagesContainer()
    : null;

  const heatmapDataByTour = heatmapCache.getOrCompute({
    userId: user.userId,
    tours,
    compute: () => budgetHeatmapData(tours, { totalPointBudget, maxGapMeters }),
  });

  const jsonBody = await Promise.all(
    tours.map(async (tour, i) => ({
      id: tour.id,
      heatmapData: heatmapDataByTour[i],
      images: await Promise.all(
        geotaggedImages(tour).map(async (img) => {
          const [url, thumbUrl] = await Promise.all([
            readSasUrl(container.getBlockBlobClient(img.blobName)),
            readSasUrl(container.getBlockBlobClient(thumbnailBlobName(img.blobName))),
          ]);
          return { id: img.id, url, thumbUrl, lat: img.lat, lon: img.lon };
        }),
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
