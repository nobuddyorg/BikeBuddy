'use strict';

const sharp = require('sharp');
const { resizeImage, resizeThumbnail, resizeVariants } = require('./resizeImage');

async function noisyPng(size) {
  const raw = Buffer.alloc(size * size * 3);
  for (let index = 0; index < raw.length; index++) raw[index] = (index * 37) % 256;
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

describe('resizeImage', () => {
  it('downscales an oversized image to the max width and re-encodes as JPEG', async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const resized = await resizeImage(buffer);
    const metadata = await sharp(resized).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(2000);
    expect(metadata.height).toBe(1000);
  });

  it('never upscales an image smaller than the max width', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const resized = await resizeImage(buffer);
    const metadata = await sharp(resized).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(50);
  });

  it('rejects an image over the pixel limit instead of decoding it', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    await expect(resizeImage(buffer, 5000)).rejects.toThrow(/exceeds pixel limit/i);
  });

  it('encodes at quality 82, not the sharp default', async () => {
    const buffer = await noisyPng(100);

    const resized = await resizeImage(buffer);
    const atQuality82 = await sharp(buffer).jpeg({ quality: 82 }).toBuffer();

    expect(resized.length).toBe(atQuality82.length);
  });
});

describe('resizeThumbnail', () => {
  it('downscales to the thumbnail width and re-encodes as JPEG', async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const thumbnail = await resizeThumbnail(buffer);
    const metadata = await sharp(thumbnail).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(160);
  });

  it('never upscales an image smaller than the thumbnail width', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const thumbnail = await resizeThumbnail(buffer);
    const metadata = await sharp(thumbnail).metadata();

    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(50);
  });

  it('rejects an image over the pixel limit instead of decoding it', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    await expect(resizeThumbnail(buffer, 5000)).rejects.toThrow(/exceeds pixel limit/i);
  });

  it('is smaller than the full-size resize for the same source image', async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const { full, thumbnail } = await resizeVariants(buffer);

    expect(thumbnail.length).toBeLessThan(full.length);
    expect((await sharp(full).metadata()).width).toBe(2000);
    expect((await sharp(thumbnail).metadata()).width).toBe(320);
  });

  it('encodes at quality 70', async () => {
    const buffer = await noisyPng(100);

    const thumbnail = await resizeThumbnail(buffer);
    const atQuality70 = await sharp(buffer).jpeg({ quality: 70 }).toBuffer();

    expect(thumbnail.length).toBe(atQuality70.length);
  });
});
