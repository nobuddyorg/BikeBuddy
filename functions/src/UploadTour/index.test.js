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
    url: 'https://blob.example/gpx-files/user-1/some-id.gpx',
  };
  const containerClient = { getBlockBlobClient: vi.fn().mockReturnValue(blockBlob) };
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
    const res = await uploadTour(
      reqWith(),
      mockAuth,
      () => toursContainer,
      makeGpxContainer(),
      makeParseFile(),
    );
    expect(res.status).toBe(201);
    expect(res.jsonBody.tourId).toMatch(/^[\da-f-]{36}$/);
    expect(res.jsonBody.gpxFileUrl).toContain('blob');
    expect(res.jsonBody.name).toBe('Test Tour');
    expect(toursContainer.items.create).toHaveBeenCalledOnce();
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
});
