import { describe, it, expect } from 'vitest';
import {
  clampIndex,
  geotaggedImages,
  imagesOfTour,
  indexOfImage,
  withImageRestored,
  withoutImage,
  wrapIndex,
} from '../src/lib/images.js';

const tourA = {
  id: 'a',
  images: [{ id: 'a1', lat: 48, lon: 11 }, { id: 'a2' }, { id: 'a3', lat: 0, lon: 0 }],
};
const tourB = { id: 'b', images: [{ id: 'b1', lat: 47, lon: 10 }] };
const bare = { id: 'c' };

describe('imagesOfTour', () => {
  it('tags each photo with its tour', () => {
    expect(imagesOfTour(tourB)).toEqual([{ id: 'b1', lat: 47, lon: 10, tourId: 'b' }]);
  });

  it('treats a tour without photos as empty', () => {
    expect(imagesOfTour(bare)).toEqual([]);
  });
});

describe('indexOfImage', () => {
  const images = [{ id: 'x' }, { id: 'y' }];

  it('finds the photo', () => {
    expect(indexOfImage(images, 'y')).toBe(1);
  });

  it('falls back to the first photo when it is gone', () => {
    expect(indexOfImage(images, 'gone')).toBe(0);
  });
});

describe('wrapIndex', () => {
  it('steps forward and back, wrapping at both ends', () => {
    expect(wrapIndex({ index: 1, step: 1, length: 3 })).toBe(2);
    expect(wrapIndex({ index: 2, step: 1, length: 3 })).toBe(0);
    expect(wrapIndex({ index: 0, step: -1, length: 3 })).toBe(2);
  });
});

describe('clampIndex', () => {
  it('keeps an index inside a shrunken list', () => {
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(3, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
  });

  it('lands on 0 for an empty list', () => {
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe('withoutImage / withImageRestored', () => {
  const images = [{ id: 'x' }, { id: 'y' }];

  it('removes the photo without touching the original list', () => {
    expect(withoutImage(images, 'x')).toEqual([{ id: 'y' }]);
    expect(images).toHaveLength(2);
  });

  it('puts a removed photo back at the end', () => {
    expect(withImageRestored([{ id: 'y' }], { id: 'x' })).toEqual([{ id: 'y' }, { id: 'x' }]);
  });

  it('does not duplicate a photo that is already back', () => {
    expect(withImageRestored(images, { id: 'x' })).toBe(images);
  });
});

describe('geotaggedImages', () => {
  it('collects located photos from every tour on the full map', () => {
    const ids = geotaggedImages({ tours: [tourA, tourB, bare], selectedTourId: null }).map(
      (image) => image.id,
    );
    expect(ids).toEqual(['a1', 'a3', 'b1']);
  });

  it('keeps to the selected tour, tagged with its id', () => {
    expect(geotaggedImages({ tours: [tourA, tourB], selectedTourId: 'b' })).toEqual([
      { id: 'b1', lat: 47, lon: 10, tourId: 'b' },
    ]);
  });

  it('requires both coordinates to be numbers', () => {
    const tour = {
      id: 't',
      images: [
        { id: 'p', lat: 1 },
        { id: 'q', lat: '1', lon: 2 },
      ],
    };
    expect(geotaggedImages({ tours: [tour], selectedTourId: null })).toEqual([]);
  });
});
