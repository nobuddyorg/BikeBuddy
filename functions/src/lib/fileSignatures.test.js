'use strict';

const { isJpegOrPng, looksLikeXml } = require('./fileSignatures');

describe('isJpegOrPng', () => {
  it('accepts valid 4-byte JPEG and PNG signatures', () => {
    expect(isJpegOrPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpegOrPng(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true);
  });

  it('rejects a buffer shorter than 4 bytes', () => {
    expect(isJpegOrPng(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it.each([
    ['JPEG byte 0', [0x00, 0xd8, 0xff, 0xe0]],
    ['JPEG byte 1', [0xff, 0x00, 0xff, 0xe0]],
    ['JPEG byte 2', [0xff, 0xd8, 0x00, 0xe0]],
    ['PNG byte 0', [0x00, 0x50, 0x4e, 0x47]],
    ['PNG byte 1', [0x89, 0x00, 0x4e, 0x47]],
    ['PNG byte 2', [0x89, 0x50, 0x00, 0x47]],
    ['PNG byte 3', [0x89, 0x50, 0x4e, 0x00]],
  ])('rejects when %s is wrong', (_label, bytes) => {
    expect(isJpegOrPng(Buffer.from(bytes))).toBe(false);
  });
});

describe('looksLikeXml', () => {
  const byteOrderMark = Buffer.from([0xef, 0xbb, 0xbf]);

  it.each(['<?xml version="1.0"?><gpx/>', '<gpx version="1.1"></gpx>'])('accepts %s', (text) => {
    expect(looksLikeXml(Buffer.from(text))).toBe(true);
    expect(looksLikeXml(Buffer.concat([byteOrderMark, Buffer.from(text)]))).toBe(true);
  });

  it.each(['not xml at all', '<html></html>', ' <?xml', '<?xm', '<gp', ''])(
    'rejects %j',
    (text) => {
      expect(looksLikeXml(Buffer.from(text))).toBe(false);
    },
  );

  it('rejects a byte order mark followed by something else', () => {
    expect(looksLikeXml(Buffer.concat([byteOrderMark, Buffer.from('hello')]))).toBe(false);
  });
});
