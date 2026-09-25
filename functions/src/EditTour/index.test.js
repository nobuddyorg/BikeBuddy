'use strict';

const { editTour } = require('./index');
const { fakeToursContainer } = require('../../test/fakes/cosmosContainer');
const { signedInAs, signedOut } = require('../../test/fakes/collaborators');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TOUR_ID = '99999999-9999-4999-8999-999999999999';

const TOUR = {
  id: TOUR_ID,
  userId: 'u1',
  name: 'Old name',
  description: 'old',
  distance: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  heatmapData: [[48.1, 11.5]],
  images: [],
};
const OTHER_USERS_TOUR = { ...TOUR, id: OTHER_TOUR_ID, userId: 'u2', name: 'Not yours' };

function setUp({ authenticate = signedInAs('u1') } = {}) {
  const tours = fakeToursContainer([TOUR, OTHER_USERS_TOUR]);
  const run = (tourId, json) =>
    editTour({ params: { tourId }, json }, { authenticate, toursContainer: () => tours });
  const withBody = (body) => async () => body;
  return { tours, run, withBody };
}

describe('PATCH /api/tours/{tourId}', () => {
  it('updates name and description and returns the updated tour', async () => {
    const { tours, run, withBody } = setUp();

    const response = await run(TOUR_ID, withBody({ name: 'New', description: 'new desc' }));

    expect(response.status).toBe(200);
    expect(response.jsonBody).toMatchObject({
      name: 'New',
      description: 'new desc',
      distance: 120,
      heatmapData: TOUR.heatmapData,
    });
    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({ name: 'New', description: 'new desc' });
  });

  it('projects away storage fields on both the write and the nothing-to-write path', async () => {
    const { run, withBody } = setUp();

    const patched = await run(TOUR_ID, withBody({ name: 'New' }));
    const unchanged = await run(TOUR_ID, withBody({}));

    for (const key of ['userId', 'images', 'gpxFileUrl', '_rid', '_self', '_etag', '_ts']) {
      expect(patched.jsonBody).not.toHaveProperty(key);
      expect(unchanged.jsonBody).not.toHaveProperty(key);
    }
    expect(unchanged.jsonBody.name).toBe('New');
  });

  it('changes only the provided field', async () => {
    const { tours, run, withBody } = setUp();

    await run(TOUR_ID, withBody({ description: 'new desc' }));

    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({
      name: 'Old name',
      description: 'new desc',
    });
  });

  it('changes the tour date', async () => {
    const { tours, run, withBody } = setUp();

    const response = await run(TOUR_ID, withBody({ createdAt: '2026-05-01T10:00:00.000Z' }));

    expect(response.jsonBody.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(tours.stored(TOUR_ID, 'u1').createdAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('ignores fields that are not editable', async () => {
    const { tours, run, withBody } = setUp();

    await run(TOUR_ID, withBody({ name: 'X', heatmapData: [], distance: 9999, userId: 'u2' }));

    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({
      name: 'X',
      heatmapData: TOUR.heatmapData,
      distance: 120,
      userId: 'u1',
    });
  });

  it('writes nothing for a body without changes, including a JSON null', async () => {
    const { tours, run, withBody } = setUp();

    const response = await run(TOUR_ID, withBody(null));

    expect(response.status).toBe(200);
    expect(response.jsonBody.name).toBe('Old name');
    expect(tours.calls.map((call) => call.operation)).toEqual(['read']);
  });

  it('keeps a photo that was uploaded between the read and the write', async () => {
    const { tours, run, withBody } = setUp();
    const uploaded = { id: 'img-1', blobName: `u1/${TOUR_ID}/img-1.jpg` };
    tours.beforeNext('patch', () => tours.seed({ ...TOUR, images: [uploaded] }));

    await run(TOUR_ID, withBody({ name: 'Renamed' }));

    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({ name: 'Renamed', images: [uploaded] });
  });

  it('returns 400 with a translatable key for an invalid field, writing nothing', async () => {
    const { tours, run, withBody } = setUp();

    const invalidName = await run(TOUR_ID, withBody({ name: '' }));
    const invalidDate = await run(TOUR_ID, withBody({ createdAt: '2026-05-01' }));

    expect(invalidName.status).toBe(400);
    expect(invalidName.jsonBody.error).toBe('errors.tourName');
    expect(invalidDate.jsonBody.error).toBe('errors.tourDate');
    expect(tours.stored(TOUR_ID, 'u1')).toMatchObject({ name: 'Old name' });
  });

  it('returns 400 for a body that is not JSON, writing nothing', async () => {
    const { tours, run } = setUp();
    const malformed = async () => JSON.parse('{"name": ');

    const response = await run(TOUR_ID, malformed);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe('errors.tourInvalid');
    expect(tours.calls.map((call) => call.operation)).toEqual(['read']);
  });

  it('rethrows a body read failure that is not malformed JSON', async () => {
    const { run } = setUp();
    const aborted = async () => {
      throw new TypeError('body stream already read');
    };

    await expect(run(TOUR_ID, aborted)).rejects.toThrow('body stream already read');
  });

  it("returns 404 for another user's tour that exists, and changes nothing", async () => {
    const { tours, run, withBody } = setUp();

    const response = await run(OTHER_TOUR_ID, withBody({ name: 'Hijacked' }));

    expect(response.status).toBe(404);
    expect(response.jsonBody.error).toBe('errors.tourNotFound');
    expect(tours.stored(OTHER_TOUR_ID, 'u2').name).toBe('Not yours');
    expect(tours.calls).toEqual([{ operation: 'read', id: OTHER_TOUR_ID, partitionKey: 'u1' }]);
  });

  it('returns 400 before any read when tourId is not a UUID', async () => {
    const { tours, run, withBody } = setUp();

    const response = await run('bad', withBody({ name: 'X' }));

    expect(response.status).toBe(400);
    expect(tours.calls).toEqual([]);
  });

  it('returns 401 without reading or writing when the caller is not signed in', async () => {
    const { tours, run, withBody } = setUp({ authenticate: signedOut });

    const response = await run(TOUR_ID, withBody({ name: 'X' }));

    expect(response.status).toBe(401);
    expect(tours.calls).toEqual([]);
  });
});
