'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, queryUserItems } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');
const { simplifyToTarget } = require('../lib/simplify');

const isGeotagged = (img) => typeof img.lat === 'number' && typeof img.lon === 'number';
const pinnedImages = (tour) => (tour.images || []).filter(isGeotagged);

// Every tour's full (up to 5,000-point) track is combined into one heat
// layer client-side; above this many combined points, tracks are simplified
// down to a share of the budget proportional to their own size so the
// response stays bounded regardless of tour count.
const TOTAL_POINT_BUDGET = 100000;
const MIN_POINTS_PER_TOUR = 20;

// Under the heat layer's dot footprint even at max zoom (see
// heatmapZoom.js), so simplified straight stretches still read as a
// continuous trail instead of breaking into dots.
const MAX_GAP_METERS = 50;

function budgetHeatmapData(tours, totalPointBudget, maxGapMeters) {
  const totalPoints = tours.reduce((sum, tour) => sum + (tour.heatmapData?.length || 0), 0);
  if (totalPoints <= totalPointBudget) return tours.map((tour) => tour.heatmapData || []);

  return tours.map((tour) => {
    const points = tour.heatmapData || [];
    const target = Math.max(
      MIN_POINTS_PER_TOUR,
      Math.round((totalPointBudget * points.length) / totalPoints),
    );
    return simplifyToTarget(points, target, maxGapMeters);
  });
}

// GET /api/map — every tour's track points and pinnable photos in one query,
// instead of a detail fetch each (#355). Photos without coordinates can't be
// pinned, so they cost no signature here; the gallery still gets them all.
async function getMapData(
  request,
  auth = authenticate,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
  totalPointBudget = TOTAL_POINT_BUDGET,
  maxGapMeters = MAX_GAP_METERS,
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

  const heatmapDataByTour = budgetHeatmapData(tours, totalPointBudget, maxGapMeters);

  const jsonBody = await Promise.all(
    tours.map(async (tour, i) => ({
      id: tour.id,
      heatmapData: heatmapDataByTour[i],
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

module.exports = { getMapData, isGeotagged, budgetHeatmapData };
