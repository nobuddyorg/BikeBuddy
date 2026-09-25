// @ts-check
'use strict';

// Every blob of a user sits under this prefix, in both containers.
const userBlobPrefix = (userId) => `${userId}/`;

const gpxBlobName = ({ userId, tourId }) => `${userBlobPrefix(userId)}${tourId}.gpx`;

const imageBlobName = ({ userId, tourId, imageId }) =>
  `${userBlobPrefix(userId)}${tourId}/${imageId}.jpg`;

// Images are always re-encoded to .jpg; the thumbnail's name derives from the
// full image's, so a document stores only one.
const thumbnailBlobName = (blobName) => blobName.replace(/\.jpg$/, '_thumb.jpg');

module.exports = { userBlobPrefix, gpxBlobName, imageBlobName, thumbnailBlobName };
