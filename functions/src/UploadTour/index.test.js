'use strict';

const { uploadTour } = require('./index');
const {
  fakeToursContainer,
  fakeUsersContainer,
  cosmosError,
} = require('../../test/fakes/cosmosContainer');
const { fakeGpxContainer } = require('../../test/fakes/blobContainer');
const { withFailureResponse } = require('../lib/failureResponse');
const {
  signedInAs,
  signedOut,
  fixedClock,
  NOW,
  idsInOrder,
} = require('../../test/fakes/collaborators');

const TOUR_ID = '11111111-1111-4111-8111-111111111111';
const GPX_BLOB = `u1/${TOUR_ID}.gpx`;

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Test Tour</name><time>2024-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;
const BARE_GPX =
  '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
  '<trk><trkseg><trkpt lat="48.1" lon="11.5"/></trkseg></trk></gpx>';

const fileOf = (content) => async () => ({
  filename: 'tour.gpx',
  mimeType: 'application/gpx+xml',
  buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
});
const clientError = (message) => Object.assign(new Error(message), { status: 400 });

function setUp({ authenticate = signedInAs('u1'), parseFile = fileOf(GPX), queued = [] } = {}) {
  const tours = fakeToursContainer();
  const gpx = fakeGpxContainer();
  const deletions = fakeUsersContainer(queued);
  const run = (query = {}) =>
    uploadTour(
      { query: new URLSearchParams(query) },
      {
        authenticate,
        deletionsContainer: () => deletions,
        toursContainer: () => tours,
        gpxContainer: async () => gpx,
        parseFile,
        newId: idsInOrder(TOUR_ID),
        now: fixedClock,
      },
    );
  const storedTour = () => tours.stored(TOUR_ID, 'u1');
  return { tours, gpx, run, storedTour };
}

describe('POST /api/tours/upload', () => {
  it('stores the GPX and the tour, and returns 201 with the new tour id', async () => {
    const { gpx, run, storedTour } = setUp();

    const response = await run();

    expect(response.status).toBe(201);
    expect(response.jsonBody).toStrictEqual({
      tourId: TOUR_ID,
      name: 'Test Tour',
      distance: expect.any(Number),
      createdAt: '2024-06-01T10:00:00.000Z',
    });
    expect(gpx.blob(GPX_BLOB)).toEqual({
      data: Buffer.from(GPX, 'utf8'),
      contentType: 'application/gpx+xml',
    });
    expect(storedTour()).toMatchObject({
      id: TOUR_ID,
      userId: 'u1',
      schemaVersion: 1,
      name: 'Test Tour',
      description: '',
      images: [],
      gpxFileUrl: `https://fake.blob/gpx-files/${GPX_BLOB}`,
      heatmapData: [
        [48.1351, 11.582],
        [48.1361, 11.583],
      ],
    });
  });

  it('never returns the stored blob URL', async () => {
    const { run } = setUp();

    const response = await run();

    expect(JSON.stringify(response.jsonBody)).not.toContain('fake.blob');
  });

  it('files the tour and its blob under the token user, whatever the request says', async () => {
    const { tours, gpx, run } = setUp();

    await run({ userId: 'u2', name: 'Mine' });

    expect(tours.all().map((stored) => stored.userId)).toEqual(['u1']);
    expect(gpx.names()).toEqual([GPX_BLOB]);
  });

  it('takes name and description from the query, the name over the GPX name', async () => {
    const { run, storedTour } = setUp();

    await run({ name: 'My Custom Name', description: 'Nice ride' });

    expect(storedTour()).toMatchObject({ name: 'My Custom Name', description: 'Nice ride' });
  });

  it('falls back to "Untitled Tour" and the upload time without GPX name or time', async () => {
    const { run, storedTour } = setUp({ parseFile: fileOf(BARE_GPX) });

    const response = await run();

    expect(response.jsonBody.name).toBe('Untitled Tour');
    expect(storedTour().createdAt).toBe(NOW.toISOString());
  });

  it.each([
    ['a numeric name as text (#548)', '<name>20240512</name>', '20240512'],
    ['the text of a name with attributes', '<name lang="de">Isartal</name>', 'Isartal'],
    ['a name with its angle brackets removed', '<name>&lt;b&gt;Alps&lt;/b&gt;</name>', 'bAlps/b'],
    [
      '"Untitled Tour" for a name over 200 characters',
      `<name>${'a'.repeat(201)}</name>`,
      'Untitled Tour',
    ],
    ['"Untitled Tour" for a name that is only markup', '<name>&lt;&gt;</name>', 'Untitled Tour'],
  ])('stores %s from the GPX', async (_label, nameTag, expected) => {
    const gpx = `<gpx><metadata>${nameTag}</metadata><trk><trkseg><trkpt lat="48" lon="11"/></trkseg></trk></gpx>`;
    const { run, storedTour } = setUp({ parseFile: fileOf(gpx) });

    await run();

    expect(storedTour().name).toBe(expected);
  });

  it('accepts a file behind a UTF-8 byte order mark', async () => {
    const withMark = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(GPX, 'utf8')]);
    const { run } = setUp({ parseFile: fileOf(withMark) });

    expect((await run()).status).toBe(201);
  });

  it('stores elevation, duration and speed parsed from the GPX, null when absent', async () => {
    const timed = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"><ele>500</ele><time>2024-06-01T10:00:00Z</time></trkpt>
    <trkpt lat="48.1361" lon="11.5830"><ele>520</ele><time>2024-06-01T10:10:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`;
    const withStats = setUp({ parseFile: fileOf(timed) });
    const withoutStats = setUp();

    await withStats.run();
    await withoutStats.run();

    expect(withStats.storedTour()).toMatchObject({
      elevationGain: 20,
      elevationLoss: 0,
      minElevation: 500,
      maxElevation: 520,
      durationSeconds: 600,
    });
    expect(withoutStats.storedTour()).toMatchObject({ elevationGain: null, durationSeconds: null });
  });

  it('writes the blob before the document', async () => {
    const { tours, gpx, run } = setUp();
    let blobsWhenCreated = [];
    tours.beforeNext('create', () => {
      blobsWhenCreated = gpx.names();
    });

    await run();

    expect(blobsWhenCreated).toEqual([GPX_BLOB]);
  });

  it('writes no document when the blob upload fails', async () => {
    const { tours, gpx, run } = setUp();
    gpx.failOn('upload', { error: new Error('storage down') });

    await expect(run()).rejects.toThrow('storage down');

    expect(tours.all()).toEqual([]);
  });

  it('rolls the blob back and rethrows when the document create fails', async () => {
    const { tours, gpx, run } = setUp();
    tours.failOn('create', { error: cosmosError(503, 'cosmos down') });

    await expect(run()).rejects.toThrow('cosmos down');

    expect(gpx.names()).toEqual([]);
  });

  it('surfaces both errors when the create and the rollback fail', async () => {
    const { tours, gpx, run } = setUp();
    tours.failOn('create', { error: cosmosError(503, 'cosmos down') });
    gpx.failOn('delete', { error: new Error('storage down') });

    const error = await run().catch((failure) => failure);

    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors.map((failure) => failure.message)).toEqual(['cosmos down', 'storage down']);
  });

  it.each([
    ['metadata that fails validation', { query: { name: 'a'.repeat(201) } }, 'errors.tourName'],
    [
      'a file without XML magic bytes',
      { parseFile: fileOf('not xml at all') },
      'errors.gpxInvalid',
    ],
    [
      'XML that is not GPX',
      { parseFile: fileOf('<?xml version="1.0"?><notgpx/>') },
      'errors.gpxInvalid',
    ],
    [
      'a GPX file without a single track or route point',
      { parseFile: fileOf('<?xml version="1.0"?><gpx><trk><trkseg/></trk></gpx>') },
      'errors.gpxNoTrack',
    ],
    [
      'an upload the parser refuses',
      {
        parseFile: async () => {
          throw clientError('errors.noFile');
        },
      },
      'errors.noFile',
    ],
  ])('returns 400 for %s, storing nothing', async (_label, { query, parseFile }, message) => {
    const { tours, gpx, run } = setUp({ parseFile });

    const response = await run(query);

    expect(response.status).toBe(400);
    expect(response.jsonBody.error).toBe(message);
    expect([...tours.calls, ...gpx.calls]).toEqual([]);
  });

  it('rolls its GPX blob back and answers 503 when Cosmos throttles the create', async () => {
    const { tours, gpx, run } = setUp();
    tours.failOn('create', { error: cosmosError(429, 'Request rate is large') });
    const context = { invocationId: 'invocation-1', error: vi.fn() };

    const response = await withFailureResponse(() => run())({}, context);

    expect(response.status).toBe(503);
    expect(response.jsonBody).toStrictEqual({ error: 'errors.busy', invocationId: 'invocation-1' });
    expect(gpx.names()).toEqual([]);
    expect(tours.all()).toEqual([]);
  });

  it('answers 410 and stores nothing while the account deletion is queued', async () => {
    const { tours, gpx, run } = setUp({
      authenticate: signedInAs('u1', { userOid: 'oid-1' }),
      queued: [{ id: 'oid-1', userId: 'u1' }],
    });

    const response = await run();

    expect(response).toEqual({ status: 410, jsonBody: { error: 'errors.accountDeleted' } });
    expect([...tours.calls, ...gpx.calls]).toEqual([]);
  });

  it('refuses a file without XML magic bytes before parsing it', async () => {
    const parseTrack = vi.fn();

    const response = await uploadTour(
      { query: new URLSearchParams() },
      {
        authenticate: signedInAs('u1'),
        toursContainer: () => fakeToursContainer(),
        gpxContainer: async () => fakeGpxContainer(),
        parseFile: fileOf('not xml at all'),
        parseTrack,
      },
    );

    expect(response.jsonBody).toEqual({ error: 'errors.gpxInvalid' });
    expect(parseTrack).not.toHaveBeenCalled();
  });

  it('rethrows a GPX parser failure that is not an invalid file', async () => {
    const tours = fakeToursContainer();
    const parseTrack = () => {
      throw new TypeError('parser bug');
    };

    await expect(
      uploadTour(
        { query: new URLSearchParams() },
        {
          authenticate: signedInAs('u1'),
          toursContainer: () => tours,
          gpxContainer: async () => fakeGpxContainer(),
          parseFile: fileOf(GPX),
          parseTrack,
        },
      ),
    ).rejects.toThrow('parser bug');
    expect(tours.all()).toEqual([]);
  });

  it('rethrows a parser failure that is not the client’s fault', async () => {
    const { run } = setUp({
      parseFile: async () => {
        throw new Error('boom');
      },
    });

    await expect(run()).rejects.toThrow('boom');
  });

  it('returns 401 without parsing or storing anything when the caller is not signed in', async () => {
    const parseFile = vi.fn(fileOf(GPX));
    const { tours, gpx, run } = setUp({ authenticate: signedOut, parseFile });

    const response = await run();

    expect(response.status).toBe(401);
    expect(parseFile).not.toHaveBeenCalled();
    expect([...tours.calls, ...gpx.calls]).toEqual([]);
  });
});
