'use strict';

const { thumbBlobName } = require('./thumbBlobName');

describe('thumbBlobName', () => {
  it('inserts _thumb before the .jpg extension', () => {
    expect(thumbBlobName('u1/t1/img1.jpg')).toBe('u1/t1/img1_thumb.jpg');
  });

  it('only touches the trailing extension, not the rest of the path', () => {
    expect(thumbBlobName('u1.jpg/t1/img1.jpg')).toBe('u1.jpg/t1/img1_thumb.jpg');
  });
});
