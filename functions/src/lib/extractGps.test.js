'use strict';

const sharp = require('sharp');
const { extractGps, gpsFromExifTags, toDecimal } = require('./extractGps');

describe('toDecimal', () => {
  it('converts [deg, min, sec] to a decimal', () => {
    expect(toDecimal([48, 30, 0], 'N')).toBeCloseTo(48.5, 5);
  });

  it('negates southern/western refs', () => {
    expect(toDecimal([48, 30, 0], 'S')).toBeCloseTo(-48.5, 5);
    expect(toDecimal([11, 0, 0], 'W')).toBeCloseTo(-11, 5);
  });

  it('passes through an already-decimal number (applying the ref sign)', () => {
    expect(toDecimal(48.5, 'N')).toBe(48.5);
    expect(toDecimal(11.25, 'W')).toBe(-11.25);
  });

  it('returns null for junk', () => {
    expect(toDecimal(undefined, 'N')).toBeNull();
    expect(toDecimal('nope', 'N')).toBeNull();
  });

  it('includes the seconds term', () => {
    // 48 + 30/60 + 36/3600
    expect(toDecimal([48, 30, 36], 'N')).toBeCloseTo(48.51, 5);
  });

  it('returns null for a non-finite decimal', () => {
    expect(toDecimal(['x', 0, 0], 'N')).toBeNull();
    expect(toDecimal(NaN, 'N')).toBeNull();
  });
});

describe('gpsFromExifTags', () => {
  it('extracts lat/lon from a GPSInfo block', () => {
    const tags = {
      GPSInfo: {
        GPSLatitude: [48, 8, 0],
        GPSLatitudeRef: 'N',
        GPSLongitude: [11, 34, 0],
        GPSLongitudeRef: 'E',
      },
    };
    const gps = gpsFromExifTags(tags);
    expect(gps.lat).toBeCloseTo(48.1333, 3);
    expect(gps.lon).toBeCloseTo(11.5667, 3);
  });

  it('returns null when there is no GPS block', () => {
    expect(gpsFromExifTags({ Image: {} })).toBeNull();
    expect(gpsFromExifTags(undefined)).toBeNull();
  });

  it('rejects out-of-range coordinates', () => {
    const tags = {
      GPSInfo: {
        GPSLatitude: [200, 0, 0],
        GPSLatitudeRef: 'N',
        GPSLongitude: [11, 0, 0],
        GPSLongitudeRef: 'E',
      },
    };
    expect(gpsFromExifTags(tags)).toBeNull();
  });

  const gpsTags = ({ latitude, north = 'N', longitude, east = 'E' }) => ({
    GPSInfo: {
      GPSLatitude: latitude,
      GPSLatitudeRef: north,
      GPSLongitude: longitude,
      GPSLongitudeRef: east,
    },
  });

  it('returns null when only one coordinate is unreadable', () => {
    expect(gpsFromExifTags(gpsTags({ latitude: [48, 8, 0] }))).toBeNull();
    expect(gpsFromExifTags(gpsTags({ longitude: [11, 34, 0] }))).toBeNull();
  });

  it('rejects each coordinate just outside its range', () => {
    const inRange = { latitude: [48, 0, 0], longitude: [11, 0, 0] };
    const outside = [
      { ...inRange, latitude: [100, 0, 0], north: 'S' },
      { ...inRange, latitude: [200, 0, 0] },
      { ...inRange, longitude: [200, 0, 0], east: 'W' },
      { ...inRange, longitude: [200, 0, 0] },
    ];
    for (const coordinates of outside) {
      expect(gpsFromExifTags(gpsTags(coordinates))).toBeNull();
    }
  });

  it('accepts the exact ±90 / ±180 boundaries', () => {
    const edge = { latitude: [90, 0, 0], longitude: [180, 0, 0] };
    expect(gpsFromExifTags(gpsTags({ ...edge, north: 'S', east: 'W' }))).toEqual({
      lat: -90,
      lon: -180,
    });
    expect(gpsFromExifTags(gpsTags(edge))).toEqual({ lat: 90, lon: 180 });
  });
});

function uint16LittleEndian(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}
function uint32LittleEndian(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}
function uint16BigEndian(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}
const rational = (whole) => Buffer.concat([uint32LittleEndian(whole), uint32LittleEndian(1)]);

// Raw TIFF bytes with a GPS IFD: sharp's withExif() only writes flat IFD0 string tags.
function buildGpsExif() {
  const header = Buffer.concat([Buffer.from('II'), uint16LittleEndian(42), uint32LittleEndian(8)]);
  const gpsIfdOffset = 8 + 2 + 12 + 4;
  const ifd0 = Buffer.concat([
    uint16LittleEndian(1),
    uint16LittleEndian(0x8825),
    uint16LittleEndian(4),
    uint32LittleEndian(1),
    uint32LittleEndian(gpsIfdOffset),
    uint32LittleEndian(0),
  ]);

  const latitudeDataOffset = gpsIfdOffset + 2 + 4 * 12 + 4;
  const longitudeDataOffset = latitudeDataOffset + 24;
  const asciiEntry = (tag, letter) =>
    Buffer.concat([
      uint16LittleEndian(tag),
      uint16LittleEndian(2),
      uint32LittleEndian(2),
      Buffer.from([letter.charCodeAt(0), 0x00, 0x00, 0x00]),
    ]);
  const rationalEntry = (tag, offset) =>
    Buffer.concat([
      uint16LittleEndian(tag),
      uint16LittleEndian(5),
      uint32LittleEndian(3),
      uint32LittleEndian(offset),
    ]);
  const gpsIfd = Buffer.concat([
    uint16LittleEndian(4),
    asciiEntry(0x0001, 'N'),
    rationalEntry(0x0002, latitudeDataOffset),
    asciiEntry(0x0003, 'E'),
    rationalEntry(0x0004, longitudeDataOffset),
    uint32LittleEndian(0),
  ]);

  const latitudeData = Buffer.concat([48, 8, 0].map(rational));
  const longitudeData = Buffer.concat([11, 34, 0].map(rational));
  return Buffer.concat([header, ifd0, gpsIfd, latitudeData, longitudeData]);
}

const plainJpeg = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .jpeg()
    .toBuffer();

async function jpegWithExifPayload(exif) {
  const jpeg = await plainJpeg();
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), exif]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    uint16BigEndian(app1Payload.length + 2),
    app1Payload,
  ]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

describe('extractGps', () => {
  it('extracts real lat/lon from an image with GPS EXIF', async () => {
    const gps = await extractGps(await jpegWithExifPayload(buildGpsExif()));
    expect(gps.lat).toBeCloseTo(48.1333, 3);
    expect(gps.lon).toBeCloseTo(11.5667, 3);
  });

  it('returns null for an image with no EXIF, without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await extractGps(await plainJpeg())).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null and warns for an image whose EXIF block is malformed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const buffer = await jpegWithExifPayload(Buffer.from('not a TIFF header at all'));
      expect(await extractGps(buffer)).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unreadable EXIF'));
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a buffer that is not an image at all', async () => {
    await expect(extractGps(Buffer.from('not an image'))).rejects.toThrow();
  });

  it('returns null for an image with EXIF but no GPS block', async () => {
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withExif({ IFD0: { Make: 'BikeBuddy' } })
      .toBuffer();
    expect(await extractGps(buffer)).toBeNull();
  });
});
