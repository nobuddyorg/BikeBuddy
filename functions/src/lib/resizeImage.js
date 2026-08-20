'use strict';

const sharp = require('sharp');

const MAX_WIDTH = 2000;

// Wide enough for the largest place a thumbnail is shown (the detail panel's
// photo grid tile) at typical device pixel ratios, small enough that a grid
// full of them — or a map full of pins — doesn't quietly cost the same
// bytes as the full-size gallery (#466).
const THUMB_WIDTH = 320;
const THUMB_QUALITY = 70;

// Originals are never stored — see docs/explanation/design-decisions.md.
async function resizeImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function resizeThumbnail(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY })
    .toBuffer();
}

module.exports = { resizeImage, resizeThumbnail };
