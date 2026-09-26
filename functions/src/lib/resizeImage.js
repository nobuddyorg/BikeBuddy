// @ts-check
'use strict';

// Required on first call: the worker loads every function, and sharp was 42 of its 434 ms of require (#578).
/** @type {(...args: Parameters<typeof import('sharp')>) => import('sharp').Sharp} */
const sharp = (...args) => require('sharp')(...args);

const MAX_WIDTH = 2000;
const FULL_QUALITY = 82;

// Sized for the detail panel's photo grid tile at typical device pixel ratios.
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_QUALITY = 70;

// Bounds the decode memory of a crafted upload, far below sharp's ~268 megapixel default.
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
