'use strict';

const { uploadTour } = require('./index');

const GPX_CONTENT = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Test Tour</name><time>2024-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

const mockAuth = async () => ({ userId: 'user-1' });
const failAuth = async () => null;

const reqWith = (query = {}) => ({ query: new URLSearchParams(query) });

function makeGpxContainer() {
  const blockBlob = {
    uploadData: vi.fn().mockResolvedValue({}),
    deleteIfExists: vi.fn().mockResolvedValue({ succeeded: true }),
    url: 'https://blob.example/gpx-files/user-1/some-id.gpx',
  };
  const getBlockBlobClient = vi.fn().mockReturnValue(blockBlob);
  const get = vi.fn().mockResolvedValue({ getBlockBlobClient });
  // Expose the inner mocks so tests can assert on blob name / upload options.
  get.getBlockBlobClient = getBlockBlobClient;
  get.blockBlob = blockBlob;
  return get;
}

function makeToursContainer() {
  return { items: { create: vi.fn().mockResolvedValue({ resource: {} }) } };
}

function makeParseFile(buffer = Buffer.from(GPX_CONTENT, 'utf8')) {
  return vi
    .fn()
    .mockResolvedValue({ filename: 'tour.gpx', mimeType: 'application/gpx+xml', buffer });
}

describe('UploadTour', () => {
  it('returns 401 when auth fails', async () => {
    const res = await uploadTour(
      reqWith(),
      failAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when parseFile rejects', async () => {
    const err = new Error('No file found');
    err.status = 400;
    const parseFile = vi.fn().mockRejectedValue(err);
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      parseFile,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toBe('No file found');
  });

  it('defaults to 500 when the parseFile error has no status', async () => {
    const parseFile = vi.fn().mockRejectedValue(new Error('boom'));
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      parseFile,
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 when file fails magic byte check', async () => {
    const parseFile = makeParseFile(Buffer.from('not xml at all'));
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      parseFile,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/GPX\/XML/);
  });

  it('returns 400 when GPX content is malformed XML', async () => {
    const parseFile = makeParseFile(Buffer.from('<?xml version="1.0"?><notgpx/>'));
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      parseFile,
    );
    expect(res.status).toBe(400);
    expect(res.jsonBody.error).toMatch(/parse GPX/);
  });

  it('creates tour and returns 201 on success', async () => {
    const toursContainer = makeToursContainer();
    const gpx = makeGpxContainer();
    const res = await uploadTour(reqWith(), mockAuth, () => toursContainer, gpx, makeParseFile());
    expect(res.status).toBe(201);
    expect(res.jsonBody.tourId).toMatch(/^[\da-f-]{36}$/);
    expect(res.jsonBody.gpxFileUrl).toContain('blob');
    expect(res.jsonBody.name).toBe('Test Tour');
    expect(toursContainer.items.create).toHaveBeenCalledOnce();

    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.images).toEqual([]);
    expect(doc.description).toBe('');
    expect(gpx.getBlockBlobClient).toHaveBeenCalledWith(`user-1/${doc.id}.gpx`);
    expect(gpx.blockBlob.uploadData).toHaveBeenCalledWith(expect.any(Buffer), {
      blobHTTPHeaders: { blobContentType: 'application/gpx+xml' },
    });
  });

  it('stores the description from the query string', async () => {
    const toursContainer = makeToursContainer();
    await uploadTour(
      reqWith({ description: 'Nice ride' }),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.description).toBe('Nice ride');
  });

  it('returns 400 when the metadata fails validation', async () => {
    const res = await uploadTour(
      reqWith({ name: 'a'.repeat(201) }),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(res.status).toBe(400);
    // A translatable key, not Zod's English.
    expect(res.jsonBody.error).toBe('errors.tourName');
  });

  it('accepts a file starting with <gpx (no XML declaration)', async () => {
    const gpxNoDecl = Buffer.from(
      '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
        '<trk><trkseg><trkpt lat="48.1" lon="11.5"/></trkseg></trk></gpx>',
      'utf8',
    );
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(gpxNoDecl),
    );
    expect(res.status).toBe(201);
    // No query-string name and no <metadata>/<trk> name in the GPX itself —
    // falls all the way through to the hardcoded default.
    expect(res.jsonBody.name).toBe('Untitled Tour');
  });

  it("uses the GPX's <time> metadata as the tour's createdAt", async () => {
    const toursContainer = makeToursContainer();
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(res.status).toBe(201);
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.createdAt).toBe('2024-06-01T10:00:00.000Z');
    expect(res.jsonBody.createdAt).toBe('2024-06-01T10:00:00.000Z');
  });

  it('falls back to the current time when the GPX has no <time> metadata', async () => {
    const noTimeGpx = Buffer.from(
      '<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">' +
        '<trk><trkseg><trkpt lat="48.1" lon="11.5"/></trkseg></trk></gpx>',
      'utf8',
    );
    const toursContainer = makeToursContainer();
    const before = Date.now();
    await uploadTour(
      reqWith(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(noTimeGpx),
    );
    const [doc] = toursContainer.items.create.mock.calls[0];
    const createdAtMs = new Date(doc.createdAt).getTime();
    expect(createdAtMs).toBeGreaterThanOrEqual(before);
    expect(createdAtMs).toBeLessThanOrEqual(Date.now());
  });

  it('uses query-string name over GPX name', async () => {
    const toursContainer = makeToursContainer();
    const res = await uploadTour(
      reqWith({ name: 'My Custom Name' }),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(res.status).toBe(201);
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.name).toBe('My Custom Name');
  });

  it('accepts a file with a UTF-8 BOM prefix', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const bomBuffer = Buffer.concat([bom, Buffer.from(GPX_CONTENT, 'utf8')]);
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(bomBuffer),
    );
    expect(res.status).toBe(201);
  });

  it('uploads the blob before creating the document', async () => {
    const order = [];
    const gpx = makeGpxContainer();
    gpx.blockBlob.uploadData.mockImplementation(async () => {
      order.push('blob');
      return {};
    });
    const toursContainer = makeToursContainer();
    toursContainer.items.create.mockImplementation(async () => {
      order.push('doc');
      return { resource: {} };
    });

    await uploadTour(reqWith(), mockAuth, () => toursContainer, gpx, makeParseFile());

    expect(order).toEqual(['blob', 'doc']);
  });

  it('rolls the blob back when the document create fails', async () => {
    const gpx = makeGpxContainer();
    const toursContainer = makeToursContainer();
    toursContainer.items.create.mockRejectedValue(new Error('cosmos down'));

    await expect(
      uploadTour(reqWith(), mockAuth, () => toursContainer, gpx, makeParseFile()),
    ).rejects.toThrow('cosmos down');

    // Without this the orphaned GPX would be unreferenced by any tour and only
    // ever cleaned up by a full account deletion.
    expect(gpx.blockBlob.deleteIfExists).toHaveBeenCalled();
  });

  it('surfaces the create failure even when the rollback itself fails', async () => {
    const gpx = makeGpxContainer();
    gpx.blockBlob.deleteIfExists.mockRejectedValue(new Error('storage down'));
    const toursContainer = makeToursContainer();
    toursContainer.items.create.mockRejectedValue(new Error('cosmos down'));

    // The create error is the actionable one; a failed best-effort cleanup must
    // not mask it.
    await expect(
      uploadTour(reqWith(), mockAuth, () => toursContainer, gpx, makeParseFile()),
    ).rejects.toThrow('cosmos down');
  });

  it('does not delete the blob when the document create succeeds', async () => {
    const gpx = makeGpxContainer();

    const res = await uploadTour(reqWith(), mockAuth, makeToursContainer, gpx, makeParseFile());

    expect(res.status).toBe(201);
    expect(gpx.blockBlob.deleteIfExists).not.toHaveBeenCalled();
  });

  it('stores elevation, duration and speed parsed from the GPX', async () => {
    const gpxWithElevation = Buffer.from(
      `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"><ele>500</ele><time>2024-06-01T10:00:00Z</time></trkpt>
    <trkpt lat="48.1361" lon="11.5830"><ele>520</ele><time>2024-06-01T10:10:00Z</time></trkpt>
  </trkseg></trk>
</gpx>`,
      'utf8',
    );
    const toursContainer = makeToursContainer();
    await uploadTour(
      reqWith(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(gpxWithElevation),
    );
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.elevationGain).toBe(20);
    expect(doc.elevationLoss).toBe(0);
    expect(doc.minElevation).toBe(500);
    expect(doc.maxElevation).toBe(520);
    expect(doc.durationSeconds).toBe(600);
  });

  it('stores null elevation/duration when the GPX has neither <ele> nor <time>', async () => {
    const toursContainer = makeToursContainer();
    await uploadTour(
      reqWith(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(), // GPX_CONTENT has neither
    );
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.elevationGain).toBeNull();
    expect(doc.durationSeconds).toBeNull();
  });
});
