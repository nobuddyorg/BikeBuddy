// @ts-check
'use strict';

const { imageBlobName, thumbnailBlobName } = require('./blobNames');

const isGeotagged = (image) => typeof image.lat === 'number' && typeof image.lon === 'number';

const geotaggedImages = (tour) => tour.images?.filter(isGeotagged) ?? [];

/**
 * An image entry as the browser gets it: short-lived URLs for the full image
 * and its thumbnail, named from the caller's id, never a stored blob name.
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

module.exports = { isGeotagged, geotaggedImages, toSignedImage };
