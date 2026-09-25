// @ts-check
'use strict';

const sharp = require('sharp');
const exifReader = require('exif-reader');

// EXIF gives [degrees, minutes, seconds] and a hemisphere; some decoders a signed decimal.
function toDecimal(value, hemisphere) {
  const decimal = Array.isArray(value) ? degreesMinutesSeconds(value) : value;
  if (!Number.isFinite(decimal)) return null;
  return hemisphere === 'S' || hemisphere === 'W' ? -Math.abs(decimal) : decimal;
}

function degreesMinutesSeconds(parts) {
  const [degrees = 0, minutes = 0, seconds = 0] = parts.map(Number);
  return degrees + minutes / 60 + seconds / 3600;
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

// Must read the original upload: the resize re-encodes and drops EXIF.
async function extractGps(buffer) {
  const { exif } = await sharp(buffer).metadata();
  if (!exif) return null;
  let tags;
  try {
    tags = exifReader(exif);
  } catch (error) {
    const { name, message } = /** @type {Error} */ (error);
    // A camera's malformed EXIF block only costs the photo its map pin.
    console.warn(`upload: unreadable EXIF (${name}: ${message})`);
    return null;
  }
  return gpsFromExifTags(tags);
}

module.exports = { extractGps, gpsFromExifTags, toDecimal };
