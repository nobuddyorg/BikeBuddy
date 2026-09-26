'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const { unauthorized } = require('../lib/http');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { readTracksByTour } = require('../lib/tourTrack');
const { budgetSegmentedTracks, TOTAL_POINT_BUDGET } = require('../lib/mapBudget');
const { geotaggedImages, toSignedImage } = require('../lib/tourImages');
const system = require('../lib/system');

// Tours from before #615 have no pointCount yet; counting their inline points is still cheaper.
const MAP_QUERY =
  'SELECT c.id, c.images, c.pointCount, ARRAY_LENGTH(c.heatmapData) AS inlinePointCount ' +
  'FROM c WHERE c.userId = @userId';
const defaultHeatmapCache = createHeatmapCache();

// A photo without coordinates cannot become a pin, so it gets no signed URL here.
async function getMapData(
  request,
  {
    authenticate = authMiddleware.authenticate,
    toursContainer = db.toursContainer,
    tracksContainer = db.tracksContainer,
    imagesContainer = blobStorage.imagesContainer,
    now = system.currentTime,
    heatmapCache = defaultHeatmapCache,
    budget = { totalPointBudget: TOTAL_POINT_BUDGET },
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const { userId } = user;

  // An inline count keys apart from a moved one: the backfill adds segment breaks (#552) that a
  // warm cache must not hide.
  const tours = (await db.queryUserItems(toursContainer(), { userId, query: MAP_QUERY })).map(
    ({ inlinePointCount, ...tour }) => ({
      ...tour,
      pointCount: tour.pointCount ?? `${inlinePointCount} inline`,
    }),
  );
  const tracksByTour = await heatmapCache.getOrCompute({
    userId,
    tours,
    compute: async () => {
      const tracksByTour = await readTracksByTour({ userId, toursContainer, tracksContainer });
      const tracks = tours.map(
        (tour) => tracksByTour.get(tour.id) ?? { heatmapData: [], segmentStarts: [] },
      );
      return budgetSegmentedTracks(tracks, budget);
    },
  });
  const signUrl = blobStorage.readUrlSigner({ container: imagesContainer, now: now() });

  const jsonBody = await Promise.all(
    tours.map(async (tour, index) => ({
      id: tour.id,
      ...tracksByTour[index],
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
  handler: withFailureResponse((request) => getMapData(request)),
});

module.exports = { getMapData };
