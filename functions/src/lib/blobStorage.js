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

// Memoised: createIfNotExists runs once per warm instance, not per request.
let gpxContainerPromise;
let imagesContainerPromise;

function ensureContainer(promiseRef, name, set) {
  if (!promiseRef) {
    const c = getClient().getContainerClient(name);
    set(c.createIfNotExists().then(() => c));
  }
}

module.exports = {
  gpxContainer: () => {
    ensureContainer(gpxContainerPromise, 'gpx-files', (p) => (gpxContainerPromise = p));
    return gpxContainerPromise;
  },
  imagesContainer: () => {
    ensureContainer(imagesContainerPromise, 'tour-images', (p) => (imagesContainerPromise = p));
    return imagesContainerPromise;
  },
  readSasUrl,
};
