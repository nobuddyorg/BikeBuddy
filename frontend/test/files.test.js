import { describe, it, expect } from 'vitest';
import {
  isGpxFile,
  isImageFile,
  validateGpxUpload,
  validateImageUpload,
  validateImageBatch,
  validateImageQuota,
  defaultTourName,
  planImageUploads,
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
  it('accepts a valid file', () => {
    expect(validateGpxUpload(file('ride.gpx', '', 1000))).toEqual([]);
  });

  it('reports the wrong extension', () => {
    expect(validateGpxUpload(file('ride.txt'))).toEqual([{ key: 'errors.gpxType', params: {} }]);
  });

  it('reports a file over the size limit, with the limit in megabytes', () => {
    expect(validateGpxUpload(file('ride.gpx', '', MAX_UPLOAD_BYTES + 1))).toEqual([
      { key: 'errors.gpxSize', params: { maxMegabytes: 10 } },
    ]);
  });

  it('accepts a file exactly at the size limit', () => {
    expect(validateGpxUpload(file('ride.gpx', '', MAX_UPLOAD_BYTES))).toEqual([]);
  });
});

describe('validateImageUpload', () => {
  it('accepts a valid image', () => {
    expect(validateImageUpload(file('p.jpg', 'image/jpeg', 1000))).toEqual([]);
  });

  it('reports non-images and oversized images', () => {
    expect(validateImageUpload(file('p.gif', 'image/gif'))).toEqual([
      { key: 'errors.imageType', params: {} },
    ]);
    expect(validateImageUpload(file('p.png', 'image/png', 10 * 1024 * 1024 + 1))).toEqual([
      { key: 'errors.imageSize', params: { maxMegabytes: 10 } },
    ]);
  });

  it('accepts an image exactly at the size limit', () => {
    expect(validateImageUpload(file('p.png', 'image/png', 10 * 1024 * 1024))).toEqual([]);
  });
});

describe('validateImageBatch', () => {
  it('accepts a batch at the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toEqual([]);
  });

  it('reports a batch over the cap', () => {
    const files = Array.from({ length: MAX_IMAGE_BATCH + 1 }, (_, i) => file(`p${i}.jpg`));
    expect(validateImageBatch(files)).toEqual([
      { key: 'errors.tooManyImages', params: { max: MAX_IMAGE_BATCH } },
    ]);
  });
});

describe('validateImageQuota', () => {
  it('accepts a tour under the cap', () => {
    expect(validateImageQuota(MAX_TOUR_IMAGES - 1)).toEqual([]);
  });

  it('reports a tour at or over the cap', () => {
    const limitReached = [{ key: 'errors.tourImageLimit', params: { max: MAX_TOUR_IMAGES } }];
    expect(validateImageQuota(MAX_TOUR_IMAGES)).toEqual(limitReached);
    expect(validateImageQuota(MAX_TOUR_IMAGES + 1)).toEqual(limitReached);
  });
});

describe('defaultTourName', () => {
  it('drops the .gpx extension, whatever its case', () => {
    expect(defaultTourName('Alpine Loop.GPX')).toBe('Alpine Loop');
    expect(defaultTourName('ride.gpx.gpx')).toBe('ride.gpx');
  });
});

describe('planImageUploads', () => {
  const jpeg = (name) => file(name, 'image/jpeg');

  it('accepts valid photos while the tour has room', () => {
    const files = [jpeg('a.jpg'), jpeg('b.jpg')];
    expect(planImageUploads({ files, existingCount: 0 })).toEqual([
      { file: files[0], problems: [] },
      { file: files[1], problems: [] },
    ]);
  });

  it('stops accepting once the tour is full, counting only accepted photos', () => {
    const files = [file('bad.gif', 'image/gif'), jpeg('a.jpg'), jpeg('b.jpg')];
    const plan = planImageUploads({ files, existingCount: MAX_TOUR_IMAGES - 1 });
    expect(plan.map(({ problems }) => problems.map((problem) => problem.key))).toEqual([
      ['errors.imageType'],
      [],
      ['errors.tourImageLimit'],
    ]);
  });

  it('lists the quota problem before the file problem', () => {
    const [{ problems }] = planImageUploads({
      files: [file('bad.gif', 'image/gif')],
      existingCount: MAX_TOUR_IMAGES,
    });
    expect(problems.map((problem) => problem.key)).toEqual([
      'errors.tourImageLimit',
      'errors.imageType',
    ]);
  });
});
