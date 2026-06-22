'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');

let blobServiceClient;
function getClient() {
  if (!blobServiceClient)
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
  return blobServiceClient;
}

// Memoised: createIfNotExists runs once per warm instance, not per request.
let gpxContainerPromise;

module.exports = {
  gpxContainer: () => {
    if (!gpxContainerPromise) {
      const c = getClient().getContainerClient('gpx-files');
      gpxContainerPromise = c.createIfNotExists().then(() => c);
    }
    return gpxContainerPromise;
  },
};
