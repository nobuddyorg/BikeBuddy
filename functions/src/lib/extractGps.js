'use strict';

const sharp = require('sharp');
const exifReader = require('exif-reader');

// EXIF stores [degrees, minutes, seconds] plus a hemisphere ref, but some
// decoders pre-convert to a signed decimal.
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

function gpsFromExifTags(tags) {
  const gps = tags?.GPSInfo || tags?.gps || tags?.GPS;
  if (!gps) return null;
  const lat = toDecimal(gps.GPSLatitude, gps.GPSLatitudeRef);
  const lon = toDecimal(gps.GPSLongitude, gps.GPSLongitudeRef);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

// Must run on the ORIGINAL upload: resizing re-encodes and drops EXIF.
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
