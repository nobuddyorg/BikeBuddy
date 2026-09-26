'use strict';

// In-memory ContainerClient subset; signed URLs spell out their scope and expiry.

function createFakeBlobContainer({ containerName, blobs = [] }) {
  const stored = new Map(blobs.map((name) => [name, { data: Buffer.from(name), contentType: '' }]));
  const failures = [];
  const calls = [];

  async function perform(operation, blobName, action) {
    calls.push({ operation, blobName });
    const failure = failures.find(
      (entry) =>
        entry.operation === operation &&
        entry.times > 0 &&
        (entry.blobName === undefined || entry.blobName === blobName),
    );
    if (failure) {
      failure.times -= 1;
      throw failure.error;
    }
    return action();
  }

  const getBlockBlobClient = (blobName) => ({
    url: `https://fake.blob/${containerName}/${blobName}`,
    uploadData: (data, options) =>
      perform('upload', blobName, () => {
        const { blobContentType, blobCacheControl } = options.blobHTTPHeaders;
        stored.set(blobName, {
          data,
          contentType: blobContentType,
          ...(blobCacheControl && { cacheControl: blobCacheControl }),
        });
        return {};
      }),
    deleteIfExists: () =>
      perform('delete', blobName, () => ({ succeeded: stored.delete(blobName) })),
    generateSasUrl: ({ permissions, expiresOn, contentDisposition }) =>
      perform('sign', blobName, () => {
        const query = new URLSearchParams({
          sp: permissions.toString(),
          sr: 'b',
          se: expiresOn.toISOString(),
          ...(contentDisposition && { rscd: contentDisposition }),
        });
        return `https://fake.blob/${containerName}/${blobName}?${query}`;
      }),
  });

  async function* listBlobsFlat({ prefix = '' } = {}) {
    calls.push({ operation: 'list', blobName: prefix });
    for (const name of [...stored.keys()]) if (name.startsWith(prefix)) yield { name };
  }

  return {
    getBlockBlobClient,
    listBlobsFlat,
    // Test-side access, never used by the code under test.
    calls,
    names: () => [...stored.keys()].sort(),
    blob: (name) => stored.get(name),
    failOn: (operation, { error, blobName, times = 1 }) =>
      failures.push({ operation, error, blobName, times }),
  };
}

const fakeImagesContainer = (blobs = []) =>
  createFakeBlobContainer({ containerName: 'tour-images', blobs });
const fakeGpxContainer = (blobs = []) =>
  createFakeBlobContainer({ containerName: 'gpx-files', blobs });

module.exports = { fakeImagesContainer, fakeGpxContainer };
