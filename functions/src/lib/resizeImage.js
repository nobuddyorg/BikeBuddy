'use strict';

const sharp = require('sharp');

const MAX_WIDTH = 2000;

// Wide enough for the largest place a thumbnail is shown (the detail panel's
// photo grid tile) at typical device pixel ratios, small enough that a grid
// full of them — or a map full of pins — doesn't quietly cost the same
// bytes as the full-size gallery (#466).
const THUMB_WIDTH = 320;
const THUMB_QUALITY = 70;

// Comfortably above any real camera's output, but far below sharp's default
// ~268 megapixel ceiling — bounds worst-case decode memory for a crafted or
// corrupted upload instead of relying on the generic default.
const MAX_INPUT_PIXELS = 100_000_000;

// Originals are never stored — see docs/explanation/design-decisions.md.
async function resizeImage(buffer, maxInputPixels = MAX_INPUT_PIXELS) {
  return sharp(buffer, { limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function resizeThumbnail(buffer, maxInputPixels = MAX_INPUT_PIXELS) {
  return sharp(buffer, { limitInputPixels: maxInputPixels })
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
}

module.exports = { resizeImage, resizeThumbnail };
