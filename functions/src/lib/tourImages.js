// @ts-check
'use strict';

const { imageBlobName, thumbnailBlobName } = require('./blobNames');

const isGeotagged = (image) => typeof image.lat === 'number' && typeof image.lon === 'number';

const geotaggedImages = (tour) => tour.images?.filter(isGeotagged) ?? [];

/** Every image blob of a tour, full size and thumbnail, named from the caller's id. */
const imageBlobNames = ({ userId, tour }) =>
  (tour.images ?? []).flatMap((image) => {
    const blobName = imageBlobName({ userId, tourId: tour.id, imageId: image.id });
    return [blobName, thumbnailBlobName(blobName)];
  });

/**
 * Signed URLs for the image and its thumbnail, named from the caller's id, never a stored name.
 *
 * @param {{ id: string, lat?: number, lon?: number }} image
 * @param {{ userId: string, tourId: string, signUrl: (blobName: string) => Promise<string> }} context
 */
async function toSignedImage(image, { userId, tourId, signUrl }) {
  const blobName = imageBlobName({ userId, tourId, imageId: image.id });
  const [url, thumbUrl] = await Promise.all([
    signUrl(blobName),
    signUrl(thumbnailBlobName(blobName)),
  ]);
  return {
    id: image.id,
    url,
    thumbUrl,
    ...(isGeotagged(image) && { lat: image.lat, lon: image.lon }),
  };
}

module.exports = { isGeotagged, geotaggedImages, imageBlobNames, toSignedImage };
