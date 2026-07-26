'use strict';

const { toTourResponse } = require('./tourResponse');

const STORED = {
  id: 't1',
  userId: 'entra-subject-id',
  name: 'Alps',
  description: 'Nice ride',
  distance: 120,
  createdAt: '2026-01-01T00:00:00.000Z',
  heatmapData: [[48.1, 11.5]],
  images: [{ id: 'img1', url: 'https://blob/img1?sig=x' }],
  gpxFileUrl: 'https://blob/t1.gpx?sig=x',
  _rid: 'abc==',
  _self: 'dbs/abc/colls/def/docs/ghi/',
  _etag: '"0000-1111"',
  _attachments: 'attachments/',
  _ts: 1767225600,
};

describe('toTourResponse', () => {
  it('returns every field the client needs', () => {
    expect(toTourResponse(STORED)).toEqual({
      id: 't1',
      name: 'Alps',
      description: 'Nice ride',
      distance: 120,
      createdAt: '2026-01-01T00:00:00.000Z',
      heatmapData: [[48.1, 11.5]],
      images: [{ id: 'img1', url: 'https://blob/img1?sig=x' }],
      gpxFileUrl: 'https://blob/t1.gpx?sig=x',
    });
  });

  it('drops the Cosmos system properties and the caller subject id', () => {
    const body = toTourResponse(STORED);

    for (const key of ['userId', '_rid', '_self', '_etag', '_attachments', '_ts']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  // A field added to the stored document later must not reach the client until
  // it is listed here — that is the point of projecting rather than deleting.
  it('ignores fields it does not know about', () => {
    expect(toTourResponse({ ...STORED, internalNote: 'secret' })).not.toHaveProperty(
      'internalNote',
    );
  });
});
