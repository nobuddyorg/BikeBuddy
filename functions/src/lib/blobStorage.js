'use strict';

const { BlobServiceClient } = require('@azure/storage-blob');

let blobServiceClient;
function getClient() {
  if (!blobServiceClient)
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING);
  return blobServiceClient;
}

module.exports = {
  gpxContainer: () => getClient().getContainerClient('gpx-files'),
};
