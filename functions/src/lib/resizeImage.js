// @ts-check
'use strict';

const sharp = require('sharp');

const MAX_WIDTH = 2000;
const FULL_QUALITY = 82;

// Sized for the detail panel's photo grid tile at typical device pixel ratios.
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_QUALITY = 70;

// Far above any camera, far below sharp's ~268 megapixel default: bounds the
// decode memory of a crafted upload.
const MAX_INPUT_PIXELS = 100_000_000;

async function resizeImage(buffer, maxInputPixels = MAX_INPUT_PIXELS) {
  return sharp(buffer, { limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: FULL_QUALITY })
    .toBuffer();
}

async function resizeThumbnail(buffer, maxInputPixels = MAX_INPUT_PIXELS) {
  return sharp(buffer, { limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toBuffer();
}

// Both from the original, so the thumbnail never compounds a second lossy encode.
async function resizeVariants(buffer) {
  const [full, thumbnail] = await Promise.all([resizeImage(buffer), resizeThumbnail(buffer)]);
  return { full, thumbnail };
}

module.exports = { resizeImage, resizeThumbnail, resizeVariants };
