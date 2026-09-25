'use strict';

const { getTours } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { fakeToursContainer } = require('../../test/fakes/cosmosContainer');
const { signedInAs, signedOut } = require('../../test/fakes/collaborators');

const tour = (overrides) => ({
  userId: 'u1',
  description: '',
  distance: 10,
  heatmapData: [[48.1, 11.5]],
  images: [],
  gpxFileUrl: 'https://fake.blob/gpx-files/u1/t.gpx',
  ...overrides,
});
const OLDER = tour({ id: 't1', name: 'Older', createdAt: '2026-01-01T00:00:00.000Z' });
const NEWER = tour({ id: 't2', name: 'Newer', createdAt: '2026-02-01T00:00:00.000Z' });
const OTHER_USERS = tour({ id: 't9', userId: 'u2', name: 'Not yours', createdAt: '2026-03-01' });

function setUp(authenticate = signedInAs('u1')) {
  const tours = fakeToursContainer([OLDER, NEWER, OTHER_USERS]);
  return {
    tours,
    run: (request = {}) => getTours(request, { authenticate, toursContainer: () => tours }),
  };
}

describe('GET /api/tours', () => {
  it("lists the caller's tours newest first, as list entries without track or storage fields", async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual([
      { id: 't2', name: 'Newer', description: '', distance: 10, createdAt: NEWER.createdAt },
      { id: 't1', name: 'Older', description: '', distance: 10, createdAt: OLDER.createdAt },
    ]);
  });

  it("queries only the token user's partition, in bounded pages", async () => {
    const { tours, run } = setUp();

    await run({ query: new URLSearchParams({ userId: 'u2' }), params: { userId: 'u2' } });

    const [query] = tours.calls.filter((call) => call.operation === 'query');
    expect(query.options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
    expect(query.spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
  });

  it("never lists another user's tours", async () => {
    const { run } = setUp(signedInAs('u2'));

    const response = await run();

    expect(response.jsonBody.map((listed) => listed.id)).toEqual(['t9']);
  });

  it('returns 401 without reading anything when the caller is not signed in', async () => {
    const { tours, run } = setUp(signedOut);

    const response = await run();

    expect(response).toEqual({ status: 401, jsonBody: { error: 'Unauthorized' } });
    expect(tours.calls).toEqual([]);
  });
});
