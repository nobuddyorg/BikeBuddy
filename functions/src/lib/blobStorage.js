// @ts-check
'use strict';

const { BlobServiceClient, BlobSASPermissions, newPipeline } = require('@azure/storage-blob');
const profiling = require('./profiling');
const { onceUntilFailure } = require('./settle');

const SAS_TTL_MS = 60 * 60 * 1000;

/** When a URL signed at `now` stops working. @param {Date} now */
const sasExpiresOn = (now) => new Date(now.getTime() + SAS_TTL_MS);

/** @typedef {import('@azure/storage-blob').ContainerClient} ContainerClient */

/**
 * Read-only, one blob, until `now` plus the TTL; a signed contentDisposition names a download.
 *
 * @param {ContainerClient} container
 * @param {{ blobName: string, now: Date, contentDisposition?: string }} options
 */
function readSasUrl(container, { blobName, now, contentDisposition }) {
  return container.getBlockBlobClient(blobName).generateSasUrl({
    permissions: BlobSASPermissions.parse('r'),
    expiresOn: sasExpiresOn(now),
    ...(contentDisposition && { contentDisposition }),
  });
}

/**
 * Fetches the container only for the first URL, so a response without images never touches it.
 *
 * @param {{ container: () => Promise<ContainerClient>, now: Date }} options
 */
function readUrlSigner({ container, now }) {
  let containerPromise;
  /** @param {string} blobName @param {{ contentDisposition?: string }} [options] */
  return async (blobName, { contentDisposition } = {}) => {
    containerPromise ??= container();
    return readSasUrl(await containerPromise, { blobName, now, contentDisposition });
  };
}

/** @param {ContainerClient} container */
function blobUrl(container, blobName) {
  return container.getBlockBlobClient(blobName).url;
}

/**
 * @param {ContainerClient} container
 * @param {{ blobName: string, data: Buffer, contentType: string }} blob
 */
async function uploadBlob(container, { blobName, data, contentType }) {
  await container
    .getBlockBlobClient(blobName)
    .uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
}

/** @param {ContainerClient} container */
async function deleteBlobIfExists(container, blobName) {
  await container.getBlockBlobClient(blobName).deleteIfExists();
}

/** @param {ContainerClient} container */
async function deleteBlobsByPrefix(container, prefix) {
  const names = [];
  for await (const blob of container.listBlobsFlat({ prefix })) names.push(blob.name);
  await Promise.all(names.map((name) => deleteBlobIfExists(container, name)));
}

// Same account and credential, on a pipeline with one extra request policy.
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

// createIfNotExists runs once per warm instance, and again after a failure.
function containerOnce(name) {
  return onceUntilFailure(async () => {
    const container = getClient().getContainerClient(name);
    await container.createIfNotExists();
    return container;
  });
}

module.exports = {
  gpxContainer: containerOnce('gpx-files'),
  imagesContainer: containerOnce('tour-images'),
  sasExpiresOn,
  readSasUrl,
  readUrlSigner,
  blobUrl,
  uploadBlob,
  deleteBlobIfExists,
  deleteBlobsByPrefix,
};
