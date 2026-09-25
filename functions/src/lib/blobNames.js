// @ts-check
'use strict';

// Every blob of a user sits under this prefix, in both containers.
const userBlobPrefix = (userId) => `${userId}/`;

const gpxBlobName = ({ userId, tourId }) => `${userBlobPrefix(userId)}${tourId}.gpx`;

const imageBlobName = ({ userId, tourId, imageId }) =>
  `${userBlobPrefix(userId)}${tourId}/${imageId}.jpg`;

// The thumbnail's name derives from the full image's (always .jpg), so a document stores one.
const thumbnailBlobName = (blobName) => blobName.replace(/\.jpg$/, '_thumb.jpg');

module.exports = { userBlobPrefix, gpxBlobName, imageBlobName, thumbnailBlobName };
