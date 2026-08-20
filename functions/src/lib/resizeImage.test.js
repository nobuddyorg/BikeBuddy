'use strict';

const sharp = require('sharp');
const { resizeImage, resizeThumbnail } = require('./resizeImage');

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

  it('rejects an image over the pixel limit instead of decoding it', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    await expect(resizeImage(buffer, 5000)).rejects.toThrow(/exceeds pixel limit/i);
  });

  it('encodes at quality 82, not the sharp default', async () => {
    const width = 100;
    const height = 100;
    const raw = Buffer.alloc(width * height * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37) % 256;
    const buffer = await sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();

    const resized = await resizeImage(buffer);
    const defaultQuality = await sharp(buffer).rotate().jpeg({}).toBuffer();

    expect(resized.length).not.toBe(defaultQuality.length);
  });
});

describe('resizeThumbnail', () => {
  it('downscales to the thumbnail width and re-encodes as JPEG', async () => {
    const buffer = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const thumb = await resizeThumbnail(buffer);
    const meta = await sharp(thumb).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(160);
  });

  it('never upscales an image smaller than the thumbnail width', async () => {
    const buffer = await sharp({
      create: { width: 100, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toBuffer();

    const thumb = await resizeThumbnail(buffer);
    const meta = await sharp(thumb).metadata();

    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
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

    const [full, thumb] = await Promise.all([resizeImage(buffer), resizeThumbnail(buffer)]);

    expect(thumb.length).toBeLessThan(full.length);
  });
});
