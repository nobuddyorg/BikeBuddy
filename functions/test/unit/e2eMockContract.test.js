'use strict';

// The static e2e suite answers /api/* from hand-written mocks; they must say what the handlers say.

const { getMe } = require('../../src/GetMe');
const { getTours } = require('../../src/GetTours');
const { getTour } = require('../../src/GetTour');
const { getMapData } = require('../../src/GetMapData');
const { createHeatmapCache } = require('../../src/lib/heatmapCache');
const {
  fakeToursContainer,
  fakeTracksContainer,
  fakeUsersContainer,
} = require('../fakes/cosmosContainer');
const { fakeImagesContainer, fakeGpxContainer } = require('../fakes/blobContainer');
const { signedInAs, fixedClock } = require('../fakes/collaborators');

const USER_ID = 'local-dev-user';
// Tour ids are UUIDs: the API refuses anything else before it looks the tour up.
const WITH_PHOTOS = '11111111-1111-4111-8111-111111111111';
const WITHOUT_TRACK = '22222222-2222-4222-8222-222222222222';
const MISSING = '99999999-9999-4999-8999-999999999999';
// A slight bend the default map budget keeps, so the map answers these points as they are.
const TRACK = [
  [48.1, 11.5],
  [48.1505, 11.55],
  [48.2, 11.6],
];

let mocks;
beforeAll(async () => {
  mocks = await import('../../../e2e/fixtures/api-responses.ts');
});

// What a static spec might hold: a track with a segment break, a pinned and an unpinned photo.
const account = () => [
  mocks.mockTour({
    id: WITH_PHOTOS,
    name: 'Alps',
    description: 'Two passes',
    distance: 120.5,
    heatmapData: TRACK,
    segmentStarts: [2],
    images: [
      mocks.mockPhoto({ id: 'pinned', lat: 48.1, lon: 11.5 }),
      mocks.mockPhoto({ id: 'unpinned' }),
    ],
  }),
  mocks.mockTour({ id: WITHOUT_TRACK, name: 'Lake' }),
];

// The same tours as stored (#615): the points in a track item, their number on the tour.
function storedAs(tours) {
  const documents = tours.map(
    ({ id, name, description, distance, createdAt, heatmapData, images }) => ({
      id,
      userId: USER_ID,
      name,
      description,
      distance,
      createdAt,
      pointCount: heatmapData.length,
      images: images.map((image) => ({ id: image.id, lat: image.lat, lon: image.lon })),
    }),
  );
  const tracks = tours
    .filter(({ heatmapData }) => heatmapData.length > 0)
    .map(({ id, heatmapData, segmentStarts }) => ({
      id,
      userId: USER_ID,
      schemaVersion: 1,
      heatmapData,
      segmentStarts,
    }));
  return { tours: fakeToursContainer(documents), tracks: fakeTracksContainer(tracks) };
}

const collaborators = (tours) => {
  const stored = storedAs(tours);
  const images = fakeImagesContainer();
  return {
    authenticate: signedInAs(USER_ID),
    toursContainer: () => stored.tours,
    tracksContainer: () => stored.tracks,
    imagesContainer: async () => images,
    gpxContainer: async () => fakeGpxContainer(),
    now: fixedClock,
    heatmapCache: createHeatmapCache(),
  };
};

// What the browser receives: JSON drops undefined fields; a signed URL is the one value mocked apart.
const PLACEHOLDER_URL = 'signed-url';
const asSent = ({ status, jsonBody }) => ({
  status: status ?? 200,
  body: JSON.parse(
    JSON.stringify(jsonBody, (key, value) =>
      key === 'url' || key === 'thumbUrl' ? PLACEHOLDER_URL : value,
    ),
  ),
});
const mocked = (body, status = 200) => asSent({ status, jsonBody: body });

describe('the static e2e mocks answer as the handlers do', () => {
  it('GET /api/v1/me', async () => {
    const users = fakeUsersContainer([mocks.DEV_USER]);
    const response = await getMe(
      {},
      {
        authenticate: signedInAs(USER_ID),
        usersContainer: () => users,
        deletionsContainer: () => fakeUsersContainer(),
        now: fixedClock,
      },
    );

    expect(asSent(response)).toStrictEqual(mocked(mocks.DEV_USER));
  });

  it('GET /api/v1/tours', async () => {
    const tours = account();
    const response = await getTours({ query: new URLSearchParams() }, collaborators(tours));

    expect(asSent(response)).toStrictEqual(mocked(tours.map(mocks.listItem)));
  });

  it('GET /api/v1/map', async () => {
    const tours = account();
    const response = await getMapData({ query: new URLSearchParams() }, collaborators(tours));

    expect(asSent(response)).toStrictEqual(mocked(tours.map(mocks.mapEntry)));
  });

  it.each([WITH_PHOTOS, WITHOUT_TRACK])('GET /api/v1/tours/%s', async (tourId) => {
    const tours = account();
    const response = await getTour({ params: { tourId } }, collaborators(tours));

    const tour = tours.find(({ id }) => id === tourId);
    expect(asSent(response)).toStrictEqual(mocked(mocks.tourDetail(tour)));
  });

  it('GET /api/v1/tours/{id} of a tour the account does not have', async () => {
    const response = await getTour({ params: { tourId: MISSING } }, collaborators(account()));

    expect(asSent(response)).toStrictEqual(mocked(mocks.TOUR_NOT_FOUND, 404));
  });
});
