'use strict';

const sharp = require('sharp');

const MAX_WIDTH = 2000;

// Normalise orientation, downscale to <= MAX_WIDTH (never upscale), re-encode as
// JPEG. Originals are never stored (see CLAUDE.md).
async function resizeImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

module.exports = { resizeImage };
