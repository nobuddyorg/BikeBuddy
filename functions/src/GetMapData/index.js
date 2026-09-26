'use strict';

const { apiRoute } = require('../lib/functionsApp');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const blobStorage = require('../lib/blobStorage');
const { ERROR_KEYS, error, unauthorized } = require('../lib/http');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { readTracksByTour, readTracksOfTours } = require('../lib/tourTrack');
const { budgetSegmentedTracks, TOTAL_POINT_BUDGET } = require('../lib/mapBudget');
const { geotaggedImages, toSignedImage } = require('../lib/tourImages');
const system = require('../lib/system');
const { pageRequest, pageBody } = require('../lib/paging');

// Tours from before #615 have no pointCount yet; counting their inline points is still cheaper.
const MAP_QUERY =
  'SELECT c.id, c.images, c.pointCount, ARRAY_LENGTH(c.heatmapData) AS inlinePointCount ' +
  'FROM c WHERE c.userId = @userId';
const defaultHeatmapCache = createHeatmapCache();

const NO_TRACK = { heatmapData: [], segmentStarts: [] };

// An inline count keys apart from a moved one: the backfill adds segment breaks (#552) that a warm
// cache must not hide.
const withPointCount = ({ inlinePointCount, ...tour }) => ({
  ...tour,
  pointCount: tour.pointCount ?? `${inlinePointCount} inline`,
});

// The whole map, budgeted across every tour and memoised per rider.
async function wholeMap({ userId, toursContainer, tracksContainer, heatmapCache, budget }) {
  const tours = (await db.queryUserItems(toursContainer(), { userId, query: MAP_QUERY })).map(
    withPointCount,
  );
  const tracks = await heatmapCache.getOrCompute({
    userId,
    tours,
    compute: async () => {
      const tracksByTour = await readTracksByTour({ userId, toursContainer, tracksContainer });
      return budgetSegmentedTracks(
        tours.map((tour) => tracksByTour.get(tour.id) ?? NO_TRACK),
        budget,
      );
    },
  });
  return { tours, tracks };
}

// One page (#579), budgeted on its own and never cached: only the whole map is read repeatedly.
// Positions need an order that holds between requests, as the list's does.
async function mapPage({ userId, page, toursContainer, tracksContainer, budget }) {
  const { items: tours, more } = await db.queryUserPage(toursContainer(), {
    userId,
    query: `${MAP_QUERY} ORDER BY c.createdAt DESC`,
    offset: page.offset,
    limit: page.limit,
  });
  const tracksByTour = await readTracksOfTours({
    userId,
    tourIds: tours.map((tour) => tour.id),
    toursContainer,
    tracksContainer,
  });
  const tracks = budgetSegmentedTracks(
    tours.map((tour) => tracksByTour.get(tour.id) ?? NO_TRACK),
    budget,
  );
  return { tours, tracks, more };
}

// A photo without coordinates cannot become a pin, so it gets no signed URL here.
function mapEntries({ userId, tours, tracks, signUrl }) {
  return Promise.all(
    tours.map(async (tour, index) => ({
      id: tour.id,
      ...tracks[index],
      images: await Promise.all(
        geotaggedImages(tour).map((image) =>
          toSignedImage(image, { userId, tourId: tour.id, signUrl }),
        ),
      ),
    })),
  );
}

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
  const page = pageRequest(request.query);
  if (page.kind === 'invalid') return error(400, ERROR_KEYS.pageInvalid);
  const { userId } = user;
  const signUrl = blobStorage.readUrlSigner({ container: imagesContainer, now: now() });

  if (page.kind === 'all') {
    const map = await wholeMap({ userId, toursContainer, tracksContainer, heatmapCache, budget });
    return { status: 200, jsonBody: await mapEntries({ userId, ...map, signUrl }) };
  }
  const { more, ...map } = await mapPage({
    userId,
    page,
    toursContainer,
    tracksContainer,
    budget,
  });
  const items = await mapEntries({ userId, ...map, signUrl });
  return { status: 200, jsonBody: pageBody({ items, page, more }) };
}

apiRoute('GetMapData', {
  methods: ['get'],
  route: 'map',
  /* v8 ignore next */
  handler: (request) => getMapData(request),
});

module.exports = { getMapData };
