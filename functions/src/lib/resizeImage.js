'use strict';

const sharp = require('sharp');

const MAX_WIDTH = 2000;

// Originals are never stored — see docs/explanation/design-decisions.md.
async function resizeImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

module.exports = { resizeImage };
