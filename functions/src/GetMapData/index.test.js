'use strict';

const { getMapData } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { fakeToursContainer, fakeTracksContainer } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer } = require('../../test/fakes/blobContainer');
const {
  signedInAs,
  signedOut,
  fixedClock,
  NOW,
  signedUrlParts,
} = require('../../test/fakes/collaborators');

// The SAS window's end: the close of the hour after the one NOW falls in.
const SAS_EXPIRES_AT = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString();
// A slight bend the default budget keeps and any simplification would drop.
const TRACK = [
  [48.1, 11.5],
  [48.1505, 11.55],
  [48.2, 11.6],
];
const TOUR_WITH_PHOTOS = {
  id: 't1',
  userId: 'u1',
  heatmapData: TRACK,
  images: [
    { id: 'img1', blobName: 'u1/t1/img1.jpg', lat: 48.1, lon: 11.5 },
    { id: 'img2', blobName: 'u1/t1/img2.jpg' },
  ],
};
const TOUR_WITHOUT_TRACK = { id: 't2', userId: 'u1' };
const OTHER_USERS_TOUR = { id: 't9', userId: 'u2', heatmapData: TRACK, images: [] };

// Stored as uploads store them (#615): the points in a track item, their number on the tour.
function setUp({
  documents = [TOUR_WITH_PHOTOS, TOUR_WITHOUT_TRACK, OTHER_USERS_TOUR],
  ...options
} = {}) {
  const tours = fakeToursContainer(
    documents.map(({ heatmapData, ...tour }) =>
      heatmapData ? { ...tour, pointCount: heatmapData.length } : tour,
    ),
  );
  const tracks = fakeTracksContainer(
    documents
      .filter((tour) => tour.heatmapData)
      .map(({ id, userId, heatmapData }) => ({ id, userId, heatmapData })),
  );
  const images = fakeImagesContainer();
  const imagesContainer = vi.fn(async () => images);
  const run = (parameters = {}) =>
    getMapData(
      { query: new URLSearchParams(parameters) },
      {
        authenticate: signedInAs('u1'),
        toursContainer: () => tours,
        tracksContainer: () => tracks,
        imagesContainer,
        now: fixedClock,
        heatmapCache: createHeatmapCache(),
        ...options,
      },
    );
  return { tours, tracks, images, imagesContainer, run };
}

describe('GET /api/v1/map', () => {
  it('returns the points and pinnable photos of every tour of the caller in one response', async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual([
      {
        id: 't1',
        heatmapData: TRACK,
        segmentStarts: [],
        images: [
          {
            id: 'img1',
            url: expect.any(String),
            thumbUrl: expect.any(String),
            lat: 48.1,
            lon: 11.5,
          },
        ],
      },
      { id: 't2', heatmapData: [], segmentStarts: [], images: [] },
    ]);
  });

  it("signs read-only, short-lived URLs for the photo and its thumbnail under the caller's prefix", async () => {
    const { run } = setUp();

    const [{ images }] = (await run()).jsonBody;

    expect(signedUrlParts(images[0].url)).toMatchObject({
      path: '/tour-images/u1/t1/img1.jpg',
      permissions: 'r',
      expiresOn: SAS_EXPIRES_AT,
    });
    expect(signedUrlParts(images[0].thumbUrl).path).toBe('/tour-images/u1/t1/img1_thumb.jpg');
  });

  it('signs no URL for a photo that carries no coordinates', async () => {
    const { images, run } = setUp();

    await run();

    expect(images.calls.map((call) => call.blobName)).toEqual([
      'u1/t1/img1.jpg',
      'u1/t1/img1_thumb.jpg',
    ]);
  });

  it('never touches blob storage when no tour has a geotagged photo', async () => {
    const { imagesContainer, run } = setUp({
      documents: [{ id: 't2', userId: 'u1', images: [{ id: 'img2', blobName: 'u1/t2/img2.jpg' }] }],
    });

    const response = await run();

    expect(imagesContainer).not.toHaveBeenCalled();
    expect(response.jsonBody).toStrictEqual([
      { id: 't2', heatmapData: [], segmentStarts: [], images: [] },
    ]);
  });

  it("queries only the token user's partition, in bounded pages", async () => {
    const { tours, tracks, run } = setUp();

    await run();

    const queries = [...tours.calls, ...tracks.calls].filter((call) => call.operation === 'query');
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
      expect(query.spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
    }
  });

  it('reads the points of a tour from before #615 from the tour itself', async () => {
    const { tours, run } = setUp({ documents: [] });
    tours.seed({ id: 'old', userId: 'u1', heatmapData: TRACK, images: [] });

    const response = await run();

    expect(response.jsonBody).toStrictEqual([
      { id: 'old', heatmapData: TRACK, segmentStarts: [], images: [] },
    ]);
  });

  it('shows another user only their own tours and photos', async () => {
    const { run } = setUp({ authenticate: signedInAs('u2') });

    const response = await run();

    expect(response.jsonBody).toStrictEqual([
      { id: 't9', heatmapData: TRACK, segmentStarts: [], images: [] },
    ]);
  });

  it('returns 401 without reading anything when the caller is not signed in', async () => {
    const { tours, tracks, imagesContainer, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect([...tours.calls, ...tracks.calls]).toEqual([]);
    expect(imagesContainer).not.toHaveBeenCalled();
  });

  it('keeps a break between two segments through the budget (#552)', async () => {
    const straightLine = (latitude, count) =>
      Array.from({ length: count }, (_, index) => [latitude, 11.0 + index * 0.0001]);
    const { tours, tracks, run } = setUp({ documents: [], budget: { totalPointBudget: 100 } });
    tours.seed({ id: 'trip', userId: 'u1', pointCount: 400, images: [] });
    tracks.seed({
      id: 'trip',
      userId: 'u1',
      heatmapData: [...straightLine(48, 200), ...straightLine(52, 200)],
      segmentStarts: [200],
    });

    const [{ heatmapData, segmentStarts }] = (await run()).jsonBody;

    expect(heatmapData.length).toBeLessThanOrEqual(100);
    const [start] = segmentStarts;
    expect(heatmapData.slice(0, start).every(([latitude]) => latitude === 48)).toBe(true);
    expect(heatmapData.slice(start).every(([latitude]) => latitude === 52)).toBe(true);
    expect(heatmapData[start - 1]).toEqual([48, 11.0 + 199 * 0.0001]);
    expect(heatmapData[start]).toEqual([52, 11.0]);
  });

  it('simplifies tracks when the combined point count blows the budget', async () => {
    const straightLine = (offset, count) =>
      Array.from({ length: count }, (_, index) => [48.0 + offset, 11.0 + index * 0.0001]);
    const bigTours = [
      { id: 'big1', userId: 'u1', heatmapData: straightLine(0, 300) },
      { id: 'big2', userId: 'u1', heatmapData: straightLine(1, 300) },
    ];
    const { run } = setUp({ documents: bigTours, budget: { totalPointBudget: 200 } });

    const [first, second] = (await run()).jsonBody;

    expect(first.heatmapData.length + second.heatmapData.length).toBe(200);
    expect(first.heatmapData[0]).toEqual(bigTours[0].heatmapData[0]);
    expect(first.heatmapData.at(-1)).toEqual(bigTours[0].heatmapData.at(-1));
  });

  it('holds a map above 100,000 points to that budget by default', async () => {
    const longTrack = Array.from({ length: 100_001 }, (_, index) => [48.0, 11.0 + index * 0.00001]);
    const { run } = setUp({ documents: [{ id: 'long', userId: 'u1', heatmapData: longTrack }] });

    const [{ heatmapData }] = (await run()).jsonBody;

    expect(heatmapData).toHaveLength(100_000);
  }, 120_000); // Stryker's per-test coverage count makes 100,001 points slow in its dry run

  it('serves a repeat load of an unchanged tour set from the cache, reading no track', async () => {
    const { tracks, run } = setUp({ heatmapCache: createHeatmapCache() });

    const first = await run();
    const trackReadsAfterFirst = tracks.calls.length;
    const second = await run();

    expect(second.jsonBody[0].heatmapData).toBe(first.jsonBody[0].heatmapData);
    expect(tracks.calls).toHaveLength(trackReadsAfterFirst);
  });

  it("reads the tracks again once a tour's point count changes", async () => {
    const { tours, tracks, run } = setUp({ heatmapCache: createHeatmapCache() });
    await run();

    tours.seed({ ...tours.stored('t1', 'u1'), pointCount: 2 });
    tracks.seed({ id: 't1', userId: 'u1', heatmapData: [TRACK[0], TRACK[2]] });
    const [first] = (await run()).jsonBody;

    expect(first.heatmapData).toEqual([TRACK[0], TRACK[2]]);
  });

  it("reads the tracks again once the backfill moves a tour's points, breaks and all", async () => {
    const { tours, tracks, run } = setUp({ documents: [], heatmapCache: createHeatmapCache() });
    tours.seed({ id: 'old', userId: 'u1', heatmapData: TRACK, images: [] });
    await run();

    tours.seed({ id: 'old', userId: 'u1', pointCount: 3, images: [] });
    tracks.seed({ id: 'old', userId: 'u1', heatmapData: TRACK, segmentStarts: [2] });
    const [moved] = (await run()).jsonBody;

    expect(moved.segmentStarts).toEqual([2]);
  });

  it("reads the points again once an inline tour's point count changes", async () => {
    const { tours, run } = setUp({ documents: [], heatmapCache: createHeatmapCache() });
    tours.seed({ id: 'old', userId: 'u1', heatmapData: TRACK, images: [] });
    await run();

    tours.seed({ id: 'old', userId: 'u1', heatmapData: [TRACK[0], TRACK[2]], images: [] });
    const [changed] = (await run()).jsonBody;

    expect(changed.heatmapData).toEqual([TRACK[0], TRACK[2]]);
  });

  it('reads the tracks again once a tour is added', async () => {
    const { tours, tracks, run } = setUp({ heatmapCache: createHeatmapCache() });
    await run();
    const trackReadsAfterFirst = tracks.calls.length;

    tours.seed({ id: 't3', userId: 'u1', pointCount: 2, images: [] });
    tracks.seed({ id: 't3', userId: 'u1', heatmapData: [TRACK[0], TRACK[2]] });
    const response = await run();

    expect(tracks.calls.length).toBeGreaterThan(trackReadsAfterFirst);
    expect(response.jsonBody.map((tour) => tour.id)).toEqual(['t1', 't2', 't3']);
    expect(response.jsonBody[2].heatmapData).toEqual([TRACK[0], TRACK[2]]);
  });

  describe('with ?limit, one page at a time (#579)', () => {
    const dated = (tour, month) => ({ ...tour, createdAt: `2026-0${month}-01T00:00:00.000Z` });
    const tourWithTrack = (id, month) =>
      dated({ id, userId: 'u1', heatmapData: TRACK, images: [] }, month);

    it('walks the tours newest first, each page with its own tracks, until no token is left', async () => {
      const { run } = setUp({
        documents: [
          dated(TOUR_WITH_PHOTOS, 3),
          dated(TOUR_WITHOUT_TRACK, 2),
          tourWithTrack('t3', 1),
          OTHER_USERS_TOUR,
        ],
      });

      const first = await run({ limit: '2' });
      expect(first.status).toBe(200);
      expect(first.jsonBody.items.map(({ id }) => id)).toEqual(['t1', 't2']);
      expect(first.jsonBody.items[0]).toMatchObject({ heatmapData: TRACK, segmentStarts: [] });
      expect(first.jsonBody.items[0].images).toHaveLength(1);
      expect(first.jsonBody.items[1]).toMatchObject({ heatmapData: [], segmentStarts: [] });

      const last = await run({ limit: '2', continuationToken: first.jsonBody.continuationToken });
      expect(last.jsonBody).toStrictEqual({
        items: [{ id: 't3', heatmapData: TRACK, segmentStarts: [], images: [] }],
      });
    });

    it("reads only the page's tracks, in the token user's partition, and never the cache", async () => {
      const heatmapCache = { getOrCompute: vi.fn() };
      const { tours, tracks, run } = setUp({
        documents: [tourWithTrack('t1', 2), tourWithTrack('t2', 1)],
        heatmapCache,
      });

      await run({ limit: '1' });

      const [tourQuery] = tours.calls.filter((call) => call.operation === 'query');
      expect(tourQuery.options.partitionKey).toBe('u1');
      expect(tourQuery.spec.query).toMatch(
        / ORDER BY c\.createdAt DESC OFFSET @offset LIMIT @limit$/,
      );
      const [trackQuery] = tracks.calls.filter((call) => call.operation === 'query');
      expect(trackQuery.options.partitionKey).toBe('u1');
      expect(trackQuery.spec.parameters).toContainEqual({ name: '@tourIds', value: ['t1'] });
      expect(heatmapCache.getOrCompute).not.toHaveBeenCalled();
    });

    it('reads the points of a tour from before #615 on its page', async () => {
      const tours = fakeToursContainer([dated({ id: 'old', userId: 'u1', heatmapData: TRACK }, 1)]);
      const response = await getMapData(
        { query: new URLSearchParams({ limit: '5' }) },
        {
          authenticate: signedInAs('u1'),
          toursContainer: () => tours,
          tracksContainer: () => fakeTracksContainer(),
          imagesContainer: async () => fakeImagesContainer(),
          now: fixedClock,
        },
      );

      expect(response.jsonBody).toEqual({
        items: [{ id: 'old', heatmapData: TRACK, segmentStarts: [], images: [] }],
      });
    });

    it('budgets a page on its own', async () => {
      const { run } = setUp({
        documents: [tourWithTrack('t1', 2), tourWithTrack('t2', 1)],
        budget: { totalPointBudget: 2 },
      });

      const response = await run({ limit: '1' });

      expect(response.jsonBody.items[0].heatmapData).toEqual([TRACK[0], TRACK[2]]);
    });

    it('answers 400 errors.pageInvalid for a malformed request, without reading', async () => {
      const { tours, run } = setUp();

      const response = await run({ continuationToken: 'Mg' });

      expect(response).toEqual({ status: 400, jsonBody: { error: 'errors.pageInvalid' } });
      expect(tours.calls).toEqual([]);
    });
  });
});
