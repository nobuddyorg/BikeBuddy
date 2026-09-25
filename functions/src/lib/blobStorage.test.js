'use strict';

const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { readSasUrl, readUrlSigner } = require('./blobStorage');

// Azurite's public development account signs for real, offline: no request is sent.
const container = BlobServiceClient.fromConnectionString(
  'UseDevelopmentStorage=true',
).getContainerClient('tour-images');
const NOW = new Date('2026-03-01T12:00:00.000Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const BLOB_NAME = 'u1/t1/img1.jpg';

describe('readSasUrl', () => {
  it('signs with the shared key of the storage account', () => {
    expect(container.credential).toBeInstanceOf(StorageSharedKeyCredential);
  });

  it('grants read access to exactly one blob, the named one', async () => {
    const url = new URL(await readSasUrl(container, { blobName: BLOB_NAME, now: NOW }));

    expect(url.searchParams.get('sp')).toBe('r');
    expect(url.searchParams.get('sr')).toBe('b');
    expect(url.searchParams.get('sig')).toMatch(/.+/);
    expect(decodeURIComponent(url.pathname)).toBe(`/devstoreaccount1/tour-images/${BLOB_NAME}`);
  });

  it('expires one hour after the injected time, not the wall clock', async () => {
    const url = new URL(await readSasUrl(container, { blobName: BLOB_NAME, now: NOW }));

    const expiresOn = new Date(url.searchParams.get('se'));
    expect(expiresOn.getTime()).toBe(NOW.getTime() + ONE_HOUR_MS);
  });

  it('keeps the path under the prefix it was given', async () => {
    const url = new URL(await readSasUrl(container, { blobName: 'u2/t9.gpx', now: NOW }));

    expect(decodeURIComponent(url.pathname)).toBe('/devstoreaccount1/tour-images/u2/t9.gpx');
  });

  it('signs a download filename into the URL only when one is given', async () => {
    const plain = new URL(await readSasUrl(container, { blobName: BLOB_NAME, now: NOW }));
    const download = new URL(
      await readSasUrl(container, {
        blobName: BLOB_NAME,
        now: NOW,
        contentDisposition: 'attachment; filename="Alps.gpx"',
      }),
    );

    expect(plain.searchParams.has('rscd')).toBe(false);
    expect(download.searchParams.get('rscd')).toBe('attachment; filename="Alps.gpx"');
  });
});

describe('readUrlSigner', () => {
  it('fetches the container once, and only when the first URL is signed', async () => {
    const containerFor = vi.fn(async () => container);
    const signUrl = readUrlSigner({ container: containerFor, now: NOW });

    expect(containerFor).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([signUrl('u1/a.jpg'), signUrl('u1/b.jpg')]);

    expect(containerFor).toHaveBeenCalledTimes(1);
    expect(new URL(first).pathname).toBe('/devstoreaccount1/tour-images/u1/a.jpg');
    expect(new URL(second).searchParams.get('se')).toBe(new URL(first).searchParams.get('se'));
  });
});
