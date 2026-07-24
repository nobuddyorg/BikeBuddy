'use strict';

const sharp = require('sharp');
const { resizeImage } = require('./resizeImage');

describe('resizeImage', () => {
  it('downscales an oversized image to the max width and re-encodes as JPEG', async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const resized = await resizeImage(buffer);
    const meta = await sharp(resized).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(1000);
  });

  it('never upscales an image smaller than the max width', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const resized = await resizeImage(buffer);
    const meta = await sharp(resized).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });
});
