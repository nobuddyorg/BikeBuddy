'use strict';

const { app } = require('@azure/functions');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { budgetHeatmapData, TOTAL_POINT_BUDGET, MAX_GAP_METERS } = require('../lib/mapBudget');
const { geotaggedImages, toSignedImage } = require('../lib/tourImages');
const system = require('../lib/system');

const MAP_QUERY = 'SELECT c.id, c.heatmapData, c.images FROM c WHERE c.userId = @userId';
const defaultHeatmapCache = createHeatmapCache();

// A photo without coordinates cannot become a pin, so it gets no signed URL here.
async function getMapData(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    imagesContainer = blobStorage.imagesContainer,
    now = system.currentTime,
    heatmapCache = defaultHeatmapCache,
    budget = { totalPointBudget: TOTAL_POINT_BUDGET, maxGapMeters: MAX_GAP_METERS },
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const { userId } = user;

  const tours = await db.queryUserItems(toursContainer(), { userId, query: MAP_QUERY });
  const heatmapDataByTour = heatmapCache.getOrCompute({
    userId,
    tours,
    compute: () => budgetHeatmapData(tours, budget),
  });
  const signUrl = blobStorage.readUrlSigner({ container: imagesContainer, now: now() });

  const jsonBody = await Promise.all(
    tours.map(async (tour, index) => ({
      id: tour.id,
      heatmapData: heatmapDataByTour[index],
      images: await Promise.all(
        geotaggedImages(tour).map((image) =>
          toSignedImage(image, { userId, tourId: tour.id, signUrl }),
        ),
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
