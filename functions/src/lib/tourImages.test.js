'use strict';

const { isGeotagged, geotaggedImages, toSignedImage } = require('./tourImages');

const signUrl = async (blobName) => `https://blob/${blobName}?sig=x`;

describe('isGeotagged', () => {
  it('requires both lat and lon to be numbers, not just one', () => {
    expect(isGeotagged({ lat: 48.1, lon: 11.5 })).toBe(true);
    expect(isGeotagged({ lat: 0, lon: 0 })).toBe(true);
    expect(isGeotagged({ lat: 48.1 })).toBe(false);
    expect(isGeotagged({ lon: 11.5 })).toBe(false);
    expect(isGeotagged({ lat: '48.1', lon: '11.5' })).toBe(false);
    expect(isGeotagged({})).toBe(false);
  });
});

describe('geotaggedImages', () => {
  it('keeps only the images with coordinates', () => {
    const pinned = { id: 'a', lat: 1, lon: 2 };
    expect(geotaggedImages({ images: [pinned, { id: 'b' }] })).toEqual([pinned]);
  });

  it('treats a tour without an images field as having none', () => {
    expect(geotaggedImages({})).toEqual([]);
  });
});

describe('toSignedImage', () => {
  it('signs the full image and its thumbnail under the given user and tour', async () => {
    const signed = await toSignedImage(
      { id: 'img1', blobName: 'someone-else/t9/img1.jpg', lat: 48.1, lon: 11.5 },
      { userId: 'u1', tourId: 't1', signUrl },
    );

    expect(signed).toStrictEqual({
      id: 'img1',
      url: 'https://blob/u1/t1/img1.jpg?sig=x',
      thumbUrl: 'https://blob/u1/t1/img1_thumb.jpg?sig=x',
      lat: 48.1,
      lon: 11.5,
    });
  });

  it('omits lat and lon for an image without coordinates', async () => {
    const signed = await toSignedImage({ id: 'img2' }, { userId: 'u1', tourId: 't1', signUrl });

    expect(signed).toStrictEqual({
      id: 'img2',
      url: 'https://blob/u1/t1/img2.jpg?sig=x',
      thumbUrl: 'https://blob/u1/t1/img2_thumb.jpg?sig=x',
    });
  });
});
