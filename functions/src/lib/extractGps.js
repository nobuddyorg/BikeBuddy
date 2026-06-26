'use strict';

const sharp = require('sharp');
const exifReader = require('exif-reader');

// EXIF stores GPS as degrees/minutes/seconds ([d, m, s]) plus a hemisphere ref.
// Some decoders pre-convert to a signed decimal number; accept both shapes.
function toDecimal(value, ref) {
  let dec;
  if (Array.isArray(value)) {
    const [d = 0, m = 0, s = 0] = value.map(Number);
    dec = d + m / 60 + s / 3600;
  } else if (typeof value === 'number') {
    dec = value;
  } else {
    return null;
  }
  if (!Number.isFinite(dec)) return null;
  if (ref === 'S' || ref === 'W') dec = -Math.abs(dec);
  return dec;
}

// Pull a { lat, lon } from an exif-reader tags object, or null if absent/invalid.
function gpsFromExifTags(tags) {
  const gps = tags?.GPSInfo || tags?.gps || tags?.GPS;
  if (!gps) return null;
  const lat = toDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
  const lon = toDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

// Read GPS coordinates from an image buffer's EXIF, or null when there are none
// (or the buffer isn't a parseable image). Must run on the ORIGINAL upload —
// resizing re-encodes and drops EXIF.
async function extractGps(buffer) {
  try {
    const { exif } = await sharp(buffer).metadata();
    if (!exif) return null;
    return gpsFromExifTags(exifReader(exif));
  } catch {
    return null;
  }
}

module.exports = { extractGps, gpsFromExifTags, toDecimal };
