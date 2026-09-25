'use strict';

const { toExportDocument } = require('./exportDocument');

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
