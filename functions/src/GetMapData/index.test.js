'use strict';

const { getMapData } = require('./index');
const { MAX_ITEMS_PER_REQUEST } = require('../lib/db');
const { distanceMeters } = require('../lib/simplify');

const TOURS = [
  {
    id: 't1',
    heatmapData: [
      [48.1, 11.5],
      [48.2, 11.6],
    ],
    images: [
      { id: 'img1', blobName: 'u1/t1/img1.jpg', lat: 48.1, lon: 11.5 },
      { id: 'img2', blobName: 'u1/t1/img2.jpg' },
    ],
  },
  { id: 't2' },
];

const mockAuth = async () => ({ userId: 'u1' });
const req = {};

function makeContainer(resources = TOURS) {
  const fetchAll = vi.fn().mockResolvedValue({ resources });
  const query = vi.fn().mockReturnValue({ fetchAll });
  return { container: { items: { query } }, query };
}

function makeImagesContainer() {
  const getBlockBlobClient = vi.fn((name) => ({
    generateSasUrl: async () => `https://blob/${name}?sig=x`,
  }));
  return { getImagesContainer: () => Promise.resolve({ getBlockBlobClient }), getBlockBlobClient };
}

describe('GET /api/map', () => {
  it('returns the points and pinnable photos of every tour in one response', async () => {
    const { container } = makeContainer();
    const { getImagesContainer } = makeImagesContainer();

    const res = await getMapData(req, mockAuth, () => container, getImagesContainer);

    expect(res.status).toBe(200);
    expect(res.jsonBody).toStrictEqual([
      {
        id: 't1',
        heatmapData: [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
        images: [{ id: 'img1', url: 'https://blob/u1/t1/img1.jpg?sig=x', lat: 48.1, lon: 11.5 }],
      },
      { id: 't2', heatmapData: [], images: [] },
    ]);
  });

  it('signs no SAS URL for photos that carry no coordinates', async () => {
    const { container } = makeContainer();
    const { getImagesContainer, getBlockBlobClient } = makeImagesContainer();

    await getMapData(req, mockAuth, () => container, getImagesContainer);

    expect(getBlockBlobClient).toHaveBeenCalledTimes(1);
    expect(getBlockBlobClient).toHaveBeenCalledWith('u1/t1/img1.jpg');
  });

  it('never touches blob storage when no tour has a geotagged photo', async () => {
    const { container } = makeContainer([{ id: 't2', images: [{ id: 'img2', blobName: 'b' }] }]);
    const getImagesContainer = vi.fn();

    const res = await getMapData(req, mockAuth, () => container, getImagesContainer);

    expect(getImagesContainer).not.toHaveBeenCalled();
    expect(res.jsonBody).toStrictEqual([{ id: 't2', heatmapData: [], images: [] }]);
  });

  it('queries only the map fields, scoped to the authenticated userId', async () => {
    const { container, query } = makeContainer();
    const { getImagesContainer } = makeImagesContainer();

    await getMapData(req, mockAuth, () => container, getImagesContainer);

    const [spec, options] = query.mock.calls[0];
    expect(spec.parameters).toEqual([{ name: '@userId', value: 'u1' }]);
    expect(options).toEqual({ partitionKey: 'u1', maxItemCount: MAX_ITEMS_PER_REQUEST });
    expect(spec.query).toMatch(/SELECT c\.id, c\.heatmapData, c\.images/);
    expect(spec.query).not.toMatch(/c\.gpxFileUrl/);
  });

  it('returns 401 when auth fails', async () => {
    const failAuth = async () => null;
    const { container } = makeContainer();

    const res = await getMapData(req, failAuth, () => container);

    expect(res.status).toBe(401);
    expect(container.items.query).not.toHaveBeenCalled();
  });

  it('simplifies tracks when the combined point count blows the budget, without gaps between kept points', async () => {
    const straightLine = (offset, n) =>
      Array.from({ length: n }, (_, i) => [48.0 + offset, 11.0 + i * 0.0001]);
    const bigTours = [
      { id: 'big1', heatmapData: straightLine(0, 300) },
      { id: 'big2', heatmapData: straightLine(1, 300) },
      { id: 'big3' },
    ];
    const { container } = makeContainer(bigTours);
    const getImagesContainer = vi.fn();
    const maxGapMeters = 50;

    const res = await getMapData(
      req,
      mockAuth,
      () => container,
      getImagesContainer,
      200,
      maxGapMeters,
    );

    const [t1, t2, t3] = res.jsonBody;
    const totalReturned = t1.heatmapData.length + t2.heatmapData.length;
    expect(totalReturned).toBeLessThan(
      bigTours[0].heatmapData.length + bigTours[1].heatmapData.length,
    );
    expect(totalReturned).toBeLessThanOrEqual(200);
    expect(t1.heatmapData[0]).toEqual(bigTours[0].heatmapData[0]);
    expect(t1.heatmapData[t1.heatmapData.length - 1]).toEqual(
      bigTours[0].heatmapData[bigTours[0].heatmapData.length - 1],
    );
    expect(t3.heatmapData).toEqual([]);
    for (const heatmapData of [t1.heatmapData, t2.heatmapData]) {
      for (let i = 1; i < heatmapData.length; i++) {
        expect(distanceMeters(heatmapData[i - 1], heatmapData[i])).toBeLessThanOrEqual(
          maxGapMeters,
        );
      }
    }
  });

  it('leaves heatmapData untouched when the combined point count is within budget', async () => {
    const { container } = makeContainer();
    const { getImagesContainer } = makeImagesContainer();

    const res = await getMapData(req, mockAuth, () => container, getImagesContainer);

    expect(res.jsonBody[0].heatmapData).toEqual(TOURS[0].heatmapData);
  });
});
