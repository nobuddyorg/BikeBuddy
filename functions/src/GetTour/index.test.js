'use strict';

const { getTour } = require('./index');

const TID = '11111111-1111-4111-8111-111111111111';

const TOUR = {
  id: TID,
  userId: 'u1',
  name: 'Alps',
  distance: 120,
  heatmapData: [
    [48.1, 11.5],
    [48.2, 11.6],
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mockAuth = async () => ({ userId: 'u1' });

function makeContainer(readImpl) {
  const read = vi.fn(readImpl);
  const item = vi.fn().mockReturnValue({ read });
  return { container: { item }, item, read };
}

const reqWith = (tourId) => ({ params: { tourId } });

describe('GET /api/tours/{tourId}', () => {
  it('returns the full tour (incl. heatmapData) with 200', async () => {
    const { container, item } = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(item).toHaveBeenCalledWith(TID, 'u1'); // partition key = userId (ownership)
    expect(res.status).toBe(200);
    expect(res.jsonBody).toEqual({
      ...TOUR,
      userId: undefined,
      description: undefined,
      images: [],
      elevationGain: null,
      elevationLoss: null,
      minElevation: null,
      maxElevation: null,
      durationSeconds: null,
      movingSeconds: null,
      avgSpeed: null,
    });
    expect(res.jsonBody.heatmapData).toHaveLength(2);
  });

  // Storage metadata and the caller's Entra subject id stay server-side.
  it('projects away the Cosmos system properties and userId', async () => {
    const stored = { ...TOUR, _rid: 'abc==', _self: 'dbs/a/colls/b/docs/c/', _etag: '"1"', _ts: 1 };
    const { container } = makeContainer(async () => ({ resource: stored }));

    const res = await getTour(reqWith(TID), mockAuth, () => container);

    for (const key of ['userId', '_rid', '_self', '_etag', '_ts']) {
      expect(res.jsonBody).not.toHaveProperty(key);
    }
  });

  it('replaces gpxFileUrl with a signed SAS URL carrying the download filename', async () => {
    const tour = { ...TOUR, gpxFileUrl: 'https://blob/gpx-files/u1/t1.gpx' };
    const { container } = makeContainer(async () => ({ resource: tour }));
    const generateSasUrl = vi.fn(async () => `https://blob/u1/${TID}.gpx?sig=x`);
    const getBlockBlobClient = vi.fn(() => ({ generateSasUrl }));
    const gpxContainer = () => Promise.resolve({ getBlockBlobClient });

    const res = await getTour(reqWith(TID), mockAuth, () => container, undefined, gpxContainer);

    expect(getBlockBlobClient).toHaveBeenCalledWith(`u1/${TID}.gpx`);
    // TOUR.name is 'Alps' — the SAS carries a Content-Disposition so a plain
    // <a href> download gets the right filename without a same-origin fetch.
    expect(generateSasUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: 'attachment; filename="Alps.gpx"' }),
    );
    expect(res.jsonBody.gpxFileUrl).toBe(`https://blob/u1/${TID}.gpx?sig=x`);
  });

  it('collapses each run of disallowed filename characters to a single underscore', async () => {
    const tour = { ...TOUR, name: 'My  Alps!!', gpxFileUrl: 'https://blob/gpx-files/u1/t1.gpx' };
    const { container } = makeContainer(async () => ({ resource: tour }));
    const generateSasUrl = vi.fn(async () => `https://blob/u1/${TID}.gpx?sig=x`);
    const getBlockBlobClient = vi.fn(() => ({ generateSasUrl }));
    const gpxContainer = () => Promise.resolve({ getBlockBlobClient });

    await getTour(reqWith(TID), mockAuth, () => container, undefined, gpxContainer);

    // A naive per-character regex (no `+`) would emit "My__Alps__"; dropping
    // disallowed chars entirely (instead of "_") would emit "MyAlps".
    expect(generateSasUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: 'attachment; filename="My_Alps_.gpx"' }),
    );
  });

  it('falls back to "tour" as the download filename when the tour has no name', async () => {
    const tour = { ...TOUR, name: undefined, gpxFileUrl: 'https://blob/gpx-files/u1/t1.gpx' };
    const { container } = makeContainer(async () => ({ resource: tour }));
    const generateSasUrl = vi.fn(async () => `https://blob/u1/${TID}.gpx?sig=x`);
    const getBlockBlobClient = vi.fn(() => ({ generateSasUrl }));
    const gpxContainer = () => Promise.resolve({ getBlockBlobClient });

    await getTour(reqWith(TID), mockAuth, () => container, undefined, gpxContainer);

    expect(generateSasUrl).toHaveBeenCalledWith(
      expect.objectContaining({ contentDisposition: 'attachment; filename="tour.gpx"' }),
    );
  });

  it('returns images as { id, url }, including lat/lon only when geotagged', async () => {
    const tour = {
      ...TOUR,
      images: [
        { id: 'img1', blobName: 'u1/t1/img1.jpg', lat: 48.1, lon: 11.5 },
        { id: 'img2', blobName: 'u1/t1/img2.jpg' },
      ],
    };
    const { container } = makeContainer(async () => ({ resource: tour }));
    const getBlockBlobClient = vi.fn((name) => ({
      generateSasUrl: async () => `https://blob/${name}?sig=x`,
    }));
    const imagesContainer = () => Promise.resolve({ getBlockBlobClient });

    const res = await getTour(reqWith(TID), mockAuth, () => container, imagesContainer);

    // toStrictEqual so a stray lat/lon: undefined on the non-geotagged image is caught.
    expect(res.jsonBody.images).toStrictEqual([
      { id: 'img1', url: 'https://blob/u1/t1/img1.jpg?sig=x', lat: 48.1, lon: 11.5 },
      { id: 'img2', url: 'https://blob/u1/t1/img2.jpg?sig=x' },
    ]);
  });

  it('returns 400 when tourId is not a UUID', async () => {
    const { container, item } = makeContainer(async () => ({ resource: { ...TOUR } }));
    const res = await getTour(reqWith('not-a-uuid'), mockAuth, () => container);

    expect(res.status).toBe(400);
    expect(item).not.toHaveBeenCalled();
  });

  it('returns 404 when read resolves with no resource (missing / other user)', async () => {
    const { container } = makeContainer(async () => ({ resource: undefined }));
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(res.status).toBe(404);
    expect(res.jsonBody.error).toBe('Tour not found');
  });

  it('returns 404 when read throws a 404', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('Not found'), { code: 404 });
    });
    const res = await getTour(reqWith(TID), mockAuth, () => container);

    expect(res.status).toBe(404);
  });

  it('re-throws non-404 errors', async () => {
    const { container } = makeContainer(async () => {
      throw Object.assign(new Error('boom'), { code: 503 });
    });
    await expect(getTour(reqWith(TID), mockAuth, () => container)).rejects.toThrow('boom');
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const { container, item } = makeContainer(async () => ({ resource: TOUR }));
    const res = await getTour(reqWith(TID), failAuth, () => container);

    expect(res.status).toBe(401);
    expect(item).not.toHaveBeenCalled();
  });
});
