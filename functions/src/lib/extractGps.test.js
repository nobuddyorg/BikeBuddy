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
    // 48 + 30/60 + 36/3600 = 48.51 — pins the s/3600 contribution and its sign.
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

  const gpsTags = (lat, latRef, lon, lonRef) => ({
    GPSInfo: {
      GPSLatitude: lat,
      GPSLatitudeRef: latRef,
      GPSLongitude: lon,
      GPSLongitudeRef: lonRef,
    },
  });

  it('returns null when only one coordinate is unreadable', () => {
    expect(gpsFromExifTags(gpsTags([48, 8, 0], 'N', undefined, 'E'))).toBeNull();
    expect(gpsFromExifTags(gpsTags(undefined, 'N', [11, 34, 0], 'E'))).toBeNull();
  });

  it('rejects each coordinate just outside its range', () => {
    expect(gpsFromExifTags(gpsTags([100, 0, 0], 'S', [11, 0, 0], 'E'))).toBeNull(); // lat < -90
    expect(gpsFromExifTags(gpsTags([200, 0, 0], 'N', [11, 0, 0], 'E'))).toBeNull(); // lat > 90
    expect(gpsFromExifTags(gpsTags([48, 0, 0], 'N', [200, 0, 0], 'W'))).toBeNull(); // lon < -180
    expect(gpsFromExifTags(gpsTags([48, 0, 0], 'N', [200, 0, 0], 'E'))).toBeNull(); // lon > 180
  });

  it('accepts the exact ±90 / ±180 boundaries', () => {
    expect(gpsFromExifTags(gpsTags([90, 0, 0], 'S', [180, 0, 0], 'W'))).toEqual({
      lat: -90,
      lon: -180,
    });
    expect(gpsFromExifTags(gpsTags([90, 0, 0], 'N', [180, 0, 0], 'E'))).toEqual({
      lat: 90,
      lon: 180,
    });
  });
});

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function rational(num, den) {
  return Buffer.concat([u32(num), u32(den)]);
}

// Hand-built minimal TIFF/EXIF blob carrying a GPS IFD: sharp's withExif()
// only writes flat IFD0 string tags, so a real round-trip through the GPS
// branch needs the raw bytes rather than sharp's high-level API.
function buildGpsExif({ lat = [48, 8, 0], latRef = 'N', lon = [11, 34, 0], lonRef = 'E' } = {}) {
  const header = Buffer.concat([Buffer.from('II'), u16(42), u32(8)]);
  const ifd0Offset = 8;
  const gpsIfdOffset = ifd0Offset + 2 + 12 + 4;
  const ifd0 = Buffer.concat([
    u16(1),
    u16(0x8825),
    u16(4),
    u32(1),
    u32(gpsIfdOffset), // GPSTag -> GPS IFD
    u32(0),
  ]);

  const gpsDataStart = gpsIfdOffset + 2 + 4 * 12 + 4;
  const latDataOffset = gpsDataStart;
  const lonDataOffset = gpsDataStart + 24;
  const gpsIfd = Buffer.concat([
    u16(4),
    u16(0x0001),
    u16(2),
    u32(2),
    Buffer.from([latRef.charCodeAt(0), 0x00, 0x00, 0x00]),
    u16(0x0002),
    u16(5),
    u32(3),
    u32(latDataOffset),
    u16(0x0003),
    u16(2),
    u32(2),
    Buffer.from([lonRef.charCodeAt(0), 0x00, 0x00, 0x00]),
    u16(0x0004),
    u16(5),
    u32(3),
    u32(lonDataOffset),
    u32(0),
  ]);

  const latData = Buffer.concat(lat.map((v) => rational(v, 1)));
  const lonData = Buffer.concat(lon.map((v) => rational(v, 1)));
  return Buffer.concat([header, ifd0, gpsIfd, latData, lonData]);
}

function u16be(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
}

async function jpegWithGpsExif(overrides) {
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();
  const exif = buildGpsExif(overrides);
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), exif]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    u16be(app1Payload.length + 2),
    app1Payload,
  ]);
  return Buffer.concat([jpeg.slice(0, 2), app1, jpeg.slice(2)]);
}

describe('extractGps', () => {
  // Without this, a mutant that skips straight past the `if (!exif) return
  // null` guard (e.g. always returning null early) still passes every other
  // test here, since they all expect null anyway.
  it('extracts real lat/lon from an image with GPS EXIF', async () => {
    const buffer = await jpegWithGpsExif();
    const gps = await extractGps(buffer);
    expect(gps.lat).toBeCloseTo(48.1333, 3);
    expect(gps.lon).toBeCloseTo(11.5667, 3);
  });

  it('returns null for an image with no EXIF', async () => {
    const buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    expect(await extractGps(buffer)).toBeNull();
  });

  it('returns null for a non-image buffer', async () => {
    expect(await extractGps(Buffer.from('not an image'))).toBeNull();
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
