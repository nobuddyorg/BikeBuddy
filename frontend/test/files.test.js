import { describe, it, expect } from 'vitest';
import {
  isGpxFile,
  isImageFile,
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
  MAX_UPLOAD_BYTES,
  MAX_IMAGE_BATCH,
  MAX_TOUR_IMAGES,
} from '../src/lib/files.js';

const file = (name, type = '', size = 1000) => ({ name, type, size });

describe('isGpxFile', () => {
  it('accepts .gpx regardless of case', () => {
    expect(isGpxFile(file('ride.gpx'))).toBe(true);
    expect(isGpxFile(file('RIDE.GPX'))).toBe(true);
  });

  it('rejects other extensions and missing files', () => {
    expect(isGpxFile(file('ride.txt'))).toBe(false);
    expect(isGpxFile(null)).toBe(false);
  });
});

describe('isImageFile', () => {
  it('accepts by MIME type or by extension', () => {
    expect(isImageFile(file('p.bin', 'image/jpeg'))).toBe(true);
    expect(isImageFile(file('photo.PNG', ''))).toBe(true);
    expect(isImageFile(file('photo.jpeg', ''))).toBe(true);
  });

  it('rejects non-images', () => {
    expect(isImageFile(file('p.gif', 'image/gif'))).toBe(false);
    expect(isImageFile(null)).toBe(false);
  });
});

describe('validateGpxUpload', () => {
  it('returns null for a valid file', () => {
    expect(validateGpxUpload(file('ride.gpx', '', 1000))).toBeNull();
  });

  it('returns the i18n key for the wrong extension', () => {
    expect(validateGpxUpload(file('ride.txt'))).toBe('errors.gpxType');
  });

  it('returns the i18n key for files over the size limit', () => {
    expect(validateGpxUpload(file('ride.gpx', '', MAX_UPLOAD_BYTES + 1))).toBe('errors.gpxSize');
  });
});

describe('validateImageUpload', () => {
  it('returns null for a valid image', () => {
    expect(validateImageUpload(file('p.jpg', 'image/jpeg', 1000))).toBeNull();
  });

  it('returns i18n keys for non-images and oversized images', () => {
    expect(validateImageUpload(file('p.gif', 'image/gif'))).toBe('errors.imageType');
    expect(validateImageUpload(file('p.png', 'image/png', 11 * 1024 * 1024))).toBe(
      'errors.imageSize',
    );
  });
});

describe('validateImageBatch', () => {
  it('returns null at or under the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toBeNull();
  });

  it('returns the i18n key over the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH + 1 }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toBe('errors.tooManyImages');
  });
});

describe('validateImageQuota', () => {
  it('returns null under the cap', () => {
    expect(validateImageQuota(MAX_TOUR_IMAGES - 1)).toBeNull();
  });

  it('returns the i18n key at or over the cap', () => {
    expect(validateImageQuota(MAX_TOUR_IMAGES)).toBe('errors.tourImageLimit');
    expect(validateImageQuota(MAX_TOUR_IMAGES + 1)).toBe('errors.tourImageLimit');
  });
});
