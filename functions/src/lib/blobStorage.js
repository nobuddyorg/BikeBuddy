// @ts-check
'use strict';

const { BlobServiceClient, BlobSASPermissions, newPipeline } = require('@azure/storage-blob');
const profiling = require('./profiling');
const { onceUntilFailure, settleAllLimited } = require('./settle');

const SAS_WINDOW_MS = 60 * 60 * 1000;
const DELETE_CONCURRENCY = 16;
// For a blob never rewritten under its name (photos): a browser may keep it while its URL works.
const IMMUTABLE_CACHE_CONTROL = 'private, max-age=3600, immutable';

/**
 * When a URL signed at `now` stops working: the end of the hour after the current one. Every URL
 * signed within an hour is the same, so the browser's cache serves it, and each lives 1-2 hours.
 *
 * @param {Date} now
 */
const sasExpiresOn = (now) =>
  new Date(Math.floor(now.getTime() / SAS_WINDOW_MS) * SAS_WINDOW_MS + 2 * SAS_WINDOW_MS);

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
 * @param {{ blobName: string, data: Buffer, contentType: string, cacheControl?: string }} blob
 */
async function uploadBlob(container, { blobName, data, contentType, cacheControl }) {
  const blobHTTPHeaders = {
    blobContentType: contentType,
    ...(cacheControl && { blobCacheControl: cacheControl }),
  };
  await container.getBlockBlobClient(blobName).uploadData(data, { blobHTTPHeaders });
}

/** @param {ContainerClient} container */
async function deleteBlobIfExists(container, blobName) {
  await container.getBlockBlobClient(blobName).deleteIfExists();
}

/** @param {ContainerClient} container */
async function deleteBlobsByPrefix(container, prefix) {
  const names = [];
  for await (const blob of container.listBlobsFlat({ prefix })) names.push(blob.name);
  await settleAllLimited(
    names.map((name) => () => deleteBlobIfExists(container, name)),
    { limit: DELETE_CONCURRENCY, failureMessage: `Some blobs under ${prefix} were not deleted` },
  );
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
  IMMUTABLE_CACHE_CONTROL,
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
