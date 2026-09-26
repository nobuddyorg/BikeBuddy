'use strict';

const { getTours } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { fakeToursContainer, cosmosError } = require('../../test/fakes/cosmosContainer');
const { withFailureResponse } = require('../lib/failureResponse');
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
    run: (request = { query: new URLSearchParams() }) =>
      getTours(request, { authenticate, toursContainer: () => tours }),
  };
}

describe('GET /api/v1/tours', () => {
  it("lists the caller's tours newest first, as list entries without track or storage fields", async () => {
    const { run } = setUp();

    const response = await run();

    expect(response.status).toBe(200);
    expect(response.jsonBody).toStrictEqual([
      { id: 't2', name: 'Newer', description: '', distance: 10, createdAt: NEWER.createdAt },
      { id: 't1', name: 'Older', description: '', distance: 10, createdAt: OLDER.createdAt },
    ]);
  });

  it('lists a numeric name stored before #548 as text', async () => {
    const tours = fakeToursContainer([tour({ id: 't1', name: 20240512, createdAt: '2026-01-01' })]);

    const response = await getTours(
      { query: new URLSearchParams() },
      { authenticate: signedInAs('u1'), toursContainer: () => tours },
    );

    expect(response.jsonBody[0].name).toBe('20240512');
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

    expect(response).toEqual({ status: 401, jsonBody: { error: 'errors.unauthorized' } });
    expect(tours.calls).toEqual([]);
  });

  // Cosmos Serverless throttles with 429; the SDK retries, and this is what is left after.
  it('answers 503 with Retry-After and no internals when Cosmos still throttles', async () => {
    const { tours, run } = setUp();
    tours.failOn('query', { error: cosmosError(429, 'Request rate is large. RU charge: 42') });
    const context = { invocationId: 'invocation-1', error: vi.fn() };

    const response = await withFailureResponse(() => run())({}, context);

    expect(response).toStrictEqual({
      status: 503,
      headers: { 'Retry-After': '5' },
      jsonBody: { error: 'errors.busy', invocationId: 'invocation-1' },
    });
  });

  describe('with ?limit, one page at a time (#579)', () => {
    const THIRD = tour({ id: 't3', name: 'Newest', createdAt: '2026-03-01T00:00:00.000Z' });
    const paged = (tours, parameters) =>
      getTours(
        { query: new URLSearchParams(parameters) },
        { authenticate: signedInAs('u1'), toursContainer: () => tours },
      );

    it('walks the list newest first, page by page, until no token is left', async () => {
      const tours = fakeToursContainer([OLDER, NEWER, THIRD, OTHER_USERS]);

      const first = await paged(tours, { limit: '2' });
      expect(first.status).toBe(200);
      expect(first.jsonBody.items.map(({ id }) => id)).toEqual(['t3', 't2']);
      expect(first.jsonBody.items[0]).toStrictEqual({
        id: 't3',
        name: 'Newest',
        description: '',
        distance: 10,
        createdAt: THIRD.createdAt,
      });

      const last = await paged(tours, {
        limit: '2',
        continuationToken: first.jsonBody.continuationToken,
      });
      expect(last.jsonBody).toStrictEqual({ items: [expect.objectContaining({ id: 't1' })] });
    });

    it("asks Cosmos for one ordered page of the token user's partition, and one item more", async () => {
      const tours = fakeToursContainer([OLDER, NEWER]);

      await paged(tours, { limit: '1', continuationToken: Buffer.from('1').toString('base64url') });

      const [query] = tours.calls.filter((call) => call.operation === 'query');
      expect(query.options.partitionKey).toBe('u1');
      expect(query.spec.query).toMatch(/ ORDER BY c\.createdAt DESC OFFSET @offset LIMIT @limit$/);
      expect(query.spec.parameters).toEqual([
        { name: '@userId', value: 'u1' },
        { name: '@offset', value: 1 },
        { name: '@limit', value: 2 },
      ]);
    });

    it('ends with no token when the last page is exactly full', async () => {
      const tours = fakeToursContainer([OLDER, NEWER]);

      const response = await paged(tours, { limit: '2' });

      expect(response.jsonBody).toStrictEqual({
        items: [expect.objectContaining({ id: 't2' }), expect.objectContaining({ id: 't1' })],
      });
    });

    it('answers an empty last page for a token past the end', async () => {
      const tours = fakeToursContainer([OLDER]);

      const response = await paged(tours, {
        limit: '5',
        continuationToken: Buffer.from('40').toString('base64url'),
      });

      expect(response).toEqual({ status: 200, jsonBody: { items: [] } });
    });

    it.each([
      ['a malformed limit', { limit: '0' }],
      ['a token it did not issue', { limit: '1', continuationToken: 'LVJJRDp-YWIjUlQ6MQ' }],
    ])('answers 400 errors.pageInvalid for %s, without reading', async (_label, parameters) => {
      const tours = fakeToursContainer([OLDER]);

      const response = await paged(tours, parameters);

      expect(response).toEqual({ status: 400, jsonBody: { error: 'errors.pageInvalid' } });
      expect(tours.calls).toEqual([]);
    });
  });
});
