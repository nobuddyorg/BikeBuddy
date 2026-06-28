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

describe('extractGps', () => {
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
});
