'use strict';

const uploadTour = require('./index');

const GPX_CONTENT = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Test Tour</name><time>2024-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

function makeContext() {
  return { userId: 'user-1', res: null };
}

function makeReq(overrides = {}) {
  return {
    headers: { 'content-type': 'multipart/form-data; boundary=---boundary' },
    query: {},
    rawBody: '',
    ...overrides,
  };
}

const mockAuth = async (ctx) => {
  ctx.userId = 'user-1';
  return true;
};
const failAuth = async (ctx) => {
  ctx.res = { status: 401, body: { error: 'Unauthorized' } };
  return false;
};

// Returns an async factory for the gpx container (matches blobStorage.gpxContainer).
function makeGpxContainer() {
  const blockBlob = {
    uploadData: vi.fn().mockResolvedValue({}),
    url: 'https://blob.example/gpx-files/user-1/some-id.gpx',
  };
  const containerClient = {
    getBlockBlobClient: vi.fn().mockReturnValue(blockBlob),
  };
  return vi.fn().mockResolvedValue(containerClient);
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
    const ctx = makeContext();
    await uploadTour(
      ctx,
      makeReq(),
      failAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(ctx.res.status).toBe(401);
  });

  it('returns 400 when parseFile rejects', async () => {
    const ctx = makeContext();
    const err = new Error('No file found');
    err.status = 400;
    const parseFile = vi.fn().mockRejectedValue(err);
    await uploadTour(ctx, makeReq(), mockAuth, makeToursContainer, makeGpxContainer(), parseFile);
    expect(ctx.res.status).toBe(400);
    expect(ctx.res.body.error).toBe('No file found');
  });

  it('returns 400 when file fails magic byte check', async () => {
    const ctx = makeContext();
    const parseFile = makeParseFile(Buffer.from('not xml at all'));
    await uploadTour(ctx, makeReq(), mockAuth, makeToursContainer, makeGpxContainer(), parseFile);
    expect(ctx.res.status).toBe(400);
    expect(ctx.res.body.error).toMatch(/GPX\/XML/);
  });

  it('returns 400 when GPX content is malformed XML', async () => {
    const ctx = makeContext();
    // Starts with <?xml so passes magic check but parseGpx will throw.
    const parseFile = makeParseFile(Buffer.from('<?xml version="1.0"?><notgpx/>'));
    await uploadTour(ctx, makeReq(), mockAuth, makeToursContainer, makeGpxContainer(), parseFile);
    expect(ctx.res.status).toBe(400);
    expect(ctx.res.body.error).toMatch(/parse GPX/);
  });

  it('creates tour and returns 201 on success', async () => {
    const ctx = makeContext();
    const toursContainer = makeToursContainer();
    await uploadTour(
      ctx,
      makeReq(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(ctx.res.status).toBe(201);
    expect(ctx.res.body.tourId).toMatch(/^[\da-f-]{36}$/);
    expect(ctx.res.body.gpxFileUrl).toContain('blob');
    expect(ctx.res.body.name).toBe('Test Tour');
    expect(toursContainer.items.create).toHaveBeenCalledOnce();
  });

  it('uses query-string name over GPX name', async () => {
    const ctx = makeContext();
    const toursContainer = makeToursContainer();
    const req = makeReq({ query: { name: 'My Custom Name' } });
    await uploadTour(ctx, req, mockAuth, () => toursContainer, makeGpxContainer(), makeParseFile());
    const [doc] = toursContainer.items.create.mock.calls[0];
    expect(doc.name).toBe('My Custom Name');
  });

  it('accepts a file with a UTF-8 BOM prefix', async () => {
    const ctx = makeContext();
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const bomBuffer = Buffer.concat([bom, Buffer.from(GPX_CONTENT, 'utf8')]);
    await uploadTour(
      ctx,
      makeReq(),
      mockAuth,
      makeToursContainer,
      makeGpxContainer(),
      makeParseFile(bomBuffer),
    );
    expect(ctx.res.status).toBe(201);
  });
});
