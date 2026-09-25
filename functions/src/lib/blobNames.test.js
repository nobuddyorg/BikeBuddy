'use strict';

const { userBlobPrefix, gpxBlobName, imageBlobName, thumbnailBlobName } = require('./blobNames');

describe('blob names', () => {
  it('puts every blob of a user under the user id', () => {
    expect(userBlobPrefix('user-1')).toBe('user-1/');
    expect(gpxBlobName({ userId: 'user-1', tourId: 'tour-1' })).toBe('user-1/tour-1.gpx');
    expect(imageBlobName({ userId: 'user-1', tourId: 'tour-1', imageId: 'image-1' })).toBe(
      'user-1/tour-1/image-1.jpg',
    );
  });

  it('inserts _thumb before the .jpg extension', () => {
    expect(thumbnailBlobName('u1/t1/img1.jpg')).toBe('u1/t1/img1_thumb.jpg');
  });

  it('only touches the trailing extension, not the rest of the path', () => {
    expect(thumbnailBlobName('u1.jpg/t1/img1.jpg')).toBe('u1.jpg/t1/img1_thumb.jpg');
  });
});
