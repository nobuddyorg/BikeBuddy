'use strict';

const { BlobServiceClient, BlobSASPermissions } = require('@azure/storage-blob');

const SAS_TTL_MS = 60 * 60 * 1000; // 1 hour

// Short-lived read-only SAS URL so images are served without a public container.
function readSasUrl(blockBlobClient) {
  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse('r'),
    expiresOn: new Date(Date.now() + SAS_TTL_MS),
  });
}

let blobServiceClient;
function getClient() {
  if (!blobServiceClient)
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
  return blobServiceClient;
}

// Resolve a container, running createIfNotExists once (memoised per warm instance).
function containerOnce(name) {
  const c = getClient().getContainerClient(name);
  return c.createIfNotExists().then(() => c);
}

let gpxContainerPromise;
let imagesContainerPromise;

module.exports = {
  gpxContainer: () => (gpxContainerPromise ??= containerOnce('gpx-files')),
  imagesContainer: () => (imagesContainerPromise ??= containerOnce('tour-images')),
  readSasUrl,
};
