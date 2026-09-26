'use strict';

const { toExportDocument, toExportTour } = require('./exportDocument');

describe('toExportDocument', () => {
  it('keeps every field of the stored document but the Cosmos system properties', () => {
    const stored = {
      id: 't1',
      userId: 'u1',
      name: 'Alps',
      heatmapData: [[48.1, 11.5]],
      images: [{ id: 'i1', blobName: 'u1/t1/i1.jpg' }],
      _rid: 'abc==',
      _self: 'dbs/a/colls/b/docs/c/',
      _etag: '"1"',
      _attachments: 'attachments/',
      _ts: 1767225600,
    };

    expect(toExportDocument(stored)).toEqual({
      id: 't1',
      userId: 'u1',
      name: 'Alps',
      heatmapData: [[48.1, 11.5]],
      images: [{ id: 'i1', blobName: 'u1/t1/i1.jpg' }],
    });
  });
});

describe('toExportTour', () => {
  const STORED = {
    id: 't1',
    userId: 'u1',
    name: 'Alps',
    gpxFileUrl: 'https://account.blob/gpx-files/u1/t1.gpx',
    images: [
      { id: 'i1', blobName: 'u1/t1/i1.jpg', lat: 48.1, lon: 11.5 },
      { id: 'i2', blobName: 'u1/t1/i2.jpg' },
    ],
    _etag: '"1"',
  };

  it('swaps the unsigned storage references for the signed links, photo by photo (#540)', () => {
    expect(
      toExportTour(STORED, { gpxFileUrl: 'signed-gpx', imageUrls: ['signed-i1', 'signed-i2'] }),
    ).toStrictEqual({
      id: 't1',
      userId: 'u1',
      name: 'Alps',
      gpxFileUrl: 'signed-gpx',
      images: [
        { id: 'i1', lat: 48.1, lon: 11.5, url: 'signed-i1' },
        { id: 'i2', url: 'signed-i2' },
      ],
    });
  });

  it('leaves out gpxFileUrl for a tour without a GPX file, and answers no images as []', () => {
    const exported = toExportTour({ id: 't2', name: 'Seeded' }, { imageUrls: [] });

    expect(exported).toStrictEqual({ id: 't2', name: 'Seeded', images: [] });
  });
});
