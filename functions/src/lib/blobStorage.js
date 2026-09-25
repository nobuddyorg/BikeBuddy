// @ts-check
'use strict';

const { BlobServiceClient, BlobSASPermissions, newPipeline } = require('@azure/storage-blob');
const profiling = require('./profiling');

const SAS_TTL_MS = 60 * 60 * 1000; // 1 hour

// contentDisposition is signed into the URL itself, so a plain <a href>
// download works cross-origin without a fetch.
/**
 * @param {import('@azure/storage-blob').BlockBlobClient} blockBlobClient
 * @param {{ contentDisposition?: string }} [options]
 */
function readSasUrl(blockBlobClient, { contentDisposition } = {}) {
  return blockBlobClient.generateSasUrl({
    permissions: BlobSASPermissions.parse('r'),
    expiresOn: new Date(Date.now() + SAS_TTL_MS),
    ...(contentDisposition && { contentDisposition }),
  });
}

// Counts Blob requests per handler for a load-test run only (LOAD_PROFILING=true):
// the same account and credential, on a pipeline with one extra policy.
function withProfiling(client) {
  const pipeline = newPipeline(client.credential);
  pipeline.factories.push(profiling.blobPolicyFactory((line) => console.log(line)));
  return new BlobServiceClient(client.url, pipeline);
}

let blobServiceClient;
function getClient() {
  if (!blobServiceClient) {
    const client = BlobServiceClient.fromConnectionString(process.env.BLOB_CONNECTION_STRING ?? '');
    blobServiceClient = profiling.isEnabled(process.env) ? withProfiling(client) : client;
  }
  return blobServiceClient;
}

// createIfNotExists runs once per warm instance.
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
