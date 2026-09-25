'use strict';

const { getMapData } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { createHeatmapCache } = require('../lib/heatmapCache');
const { distanceMeters } = require('../lib/simplify');
const { fakeToursContainer } = require('../../test/fakes/cosmosContainer');
const { fakeImagesContainer } = require('../../test/fakes/blobContainer');
const {
  signedInAs,
  signedOut,
  fixedClock,
  NOW,
  signedUrlParts,
} = require('../../test/fakes/collaborators');

const ONE_HOUR_LATER = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
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

function setUp({
  documents = [TOUR_WITH_PHOTOS, TOUR_WITHOUT_TRACK, OTHER_USERS_TOUR],
  ...options
} = {}) {
  const tours = fakeToursContainer(documents);
  const images = fakeImagesContainer();
  const imagesContainer = vi.fn(async () => images);
  const run = () =>
    getMapData(
      {},
      {
        authenticate: signedInAs('u1'),
        toursContainer: () => tours,
        imagesContainer,
        now: fixedClock,
        heatmapCache: createHeatmapCache(),
        ...options,
      },
    );
  return { tours, images, imagesContainer, run };
}

describe('GET /api/map', () => {
  it('returns the points and pinnable photos of every tour of the caller in one response', async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual([
      {
        id: 't1',
        heatmapData: TRACK,
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
      { id: 't2', heatmapData: [], images: [] },
    ]);
  });

  it("signs read-only, one-hour URLs for the photo and its thumbnail under the caller's prefix", async () => {
    const { run } = setUp();

    const [{ images }] = (await run()).jsonBody;

    expect(signedUrlParts(images[0].url)).toMatchObject({
      path: '/tour-images/u1/t1/img1.jpg',
      permissions: 'r',
      expiresOn: ONE_HOUR_LATER,
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
    expect(response.jsonBody).toStrictEqual([{ id: 't2', heatmapData: [], images: [] }]);
  });

  it("queries only the token user's partition, in bounded pages", async () => {
    const { tours, run } = setUp();

    await run();

    const [query] = tours.calls.filter((call) => call.operation === 'query');
    expect(query.options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
    expect(query.spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
  });

  it('shows another user only their own tours and photos', async () => {
    const { run } = setUp({ authenticate: signedInAs('u2') });

    const response = await run();

    expect(response.jsonBody).toStrictEqual([{ id: 't9', heatmapData: TRACK, images: [] }]);
  });

  it('returns 401 without reading anything when the caller is not signed in', async () => {
    const { tours, imagesContainer, run } = setUp({ authenticate: signedOut });

    const response = await run();

    expect(response.status).toBe(401);
    expect(tours.calls).toEqual([]);
    expect(imagesContainer).not.toHaveBeenCalled();
  });

  it('simplifies tracks when the combined point count blows the budget, without gaps between kept points', async () => {
    const straightLine = (offset, count) =>
      Array.from({ length: count }, (_, index) => [48.0 + offset, 11.0 + index * 0.0001]);
    const bigTours = [
      { id: 'big1', userId: 'u1', heatmapData: straightLine(0, 300) },
      { id: 'big2', userId: 'u1', heatmapData: straightLine(1, 300) },
    ];
    const { run } = setUp({
      documents: bigTours,
      budget: { totalPointBudget: 200, maxGapMeters: 50 },
    });

    const [first, second] = (await run()).jsonBody;

    expect(first.heatmapData.length + second.heatmapData.length).toBeLessThanOrEqual(200);
    expect(first.heatmapData[0]).toEqual(bigTours[0].heatmapData[0]);
    expect(first.heatmapData.at(-1)).toEqual(bigTours[0].heatmapData.at(-1));
    for (const { heatmapData } of [first, second]) {
      for (let index = 1; index < heatmapData.length; index++) {
        expect(distanceMeters(heatmapData[index - 1], heatmapData[index])).toBeLessThanOrEqual(50);
      }
    }
  });

  it('serves a repeat load of an unchanged tour set from the cache', async () => {
    const { run } = setUp({ heatmapCache: createHeatmapCache() });

    const first = await run();
    const second = await run();

    expect(second.jsonBody[0].heatmapData).toBe(first.jsonBody[0].heatmapData);
  });
});
