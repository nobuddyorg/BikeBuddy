'use strict';

const { parseMultipart, MAX_FILE_BYTES } = require('./parseMultipart');

const BOUNDARY = '----bikebuddytest';

// Minimal multipart/form-data body with a single file part.
function multipartBody(content, { filename = 'tour.gpx', mimeType = 'application/gpx+xml' } = {}) {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
}

// A v4 HttpRequest is only touched for .headers.entries() and .body (a web
// ReadableStream), so a fake with those two is enough.
function makeRequest(
  body,
  {
    contentType = `multipart/form-data; boundary=${BOUNDARY}`,
    contentLength,
    chunkSize = 4096,
  } = {},
) {
  const headers = new Map();
  if (contentType !== null) headers.set('content-type', contentType);
  if (contentLength !== undefined) headers.set('content-length', String(contentLength));

  return {
    headers,
    body:
      body === null
        ? null
        : new ReadableStream({
            start(controller) {
              for (let i = 0; i < body.length; i += chunkSize) {
                controller.enqueue(new Uint8Array(body.subarray(i, i + chunkSize)));
              }
              controller.close();
            },
          }),
  };
}

describe('parseMultipart', () => {
  it('resolves with the file part', async () => {
    const file = await parseMultipart(makeRequest(multipartBody('<gpx/>')));

    expect(file.filename).toBe('tour.gpx');
    expect(file.mimeType).toBe('application/gpx+xml');
    expect(file.buffer.toString()).toBe('<gpx/>');
  });

  it('rejects a declared Content-Length over the limit before reading the body', async () => {
    // A body that would otherwise parse fine — only the header is oversized, so
    // this proves the pre-check fires rather than the streaming limit.
    const req = makeRequest(multipartBody('<gpx/>'), { contentLength: MAX_FILE_BYTES + 1 });

    await expect(parseMultipart(req)).rejects.toMatchObject({
      status: 400,
      message: 'File exceeds 10 MB limit',
    });
    expect(req.body.locked).toBe(false);
  });

  it('rejects an oversized upload that declares no Content-Length (#352)', async () => {
    // The chunked case the old Content-Length pre-check could not catch: no
    // length header at all, so only the streaming limit can stop it.
    const oversized = multipartBody(Buffer.alloc(MAX_FILE_BYTES + 1024, 0x41));

    await expect(parseMultipart(makeRequest(oversized))).rejects.toMatchObject({
      status: 400,
      message: 'File exceeds 10 MB limit',
    });
  });

  it('rejects an oversized upload that under-declares its Content-Length (#352)', async () => {
    // Content-Length is attacker-controlled; a low value must not buy a pass.
    const oversized = multipartBody(Buffer.alloc(MAX_FILE_BYTES + 1024, 0x41));

    await expect(
      parseMultipart(makeRequest(oversized, { contentLength: 10 })),
    ).rejects.toMatchObject({ status: 400, message: 'File exceeds 10 MB limit' });
  });

  it('accepts a file exactly at the limit', async () => {
    const atLimit = multipartBody(Buffer.alloc(MAX_FILE_BYTES, 0x41));
    const file = await parseMultipart(makeRequest(atLimit));

    expect(file.buffer.length).toBe(MAX_FILE_BYTES);
  });

  it('rejects a malformed multipart request (no boundary)', async () => {
    const req = makeRequest(multipartBody('<gpx/>'), { contentType: 'multipart/form-data' });

    await expect(parseMultipart(req)).rejects.toMatchObject({
      status: 400,
      message: 'Invalid multipart request',
    });
  });

  it('rejects when there is no file field', async () => {
    const noFile = Buffer.from(`--${BOUNDARY}--\r\n`);

    await expect(parseMultipart(makeRequest(noFile))).rejects.toMatchObject({
      status: 400,
      message: 'No file field found in request',
    });
  });

  it('rejects a request with no body at all', async () => {
    await expect(parseMultipart(makeRequest(null))).rejects.toMatchObject({
      status: 400,
      message: 'No file field found in request',
    });
  });

  it('rejects when the body stream errors mid-transfer', async () => {
    const req = makeRequest(multipartBody('<gpx/>'));
    req.body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from(`--${BOUNDARY}\r\n`)));
        controller.error(new Error('connection reset'));
      },
    });

    await expect(parseMultipart(req)).rejects.toThrow('connection reset');
  });

  // A connection dropped mid-upload: busboy surfaces it on the file stream
  // once a file part has started, and on itself when it has not. Both must
  // settle the promise — an unsettled one leaves the request hanging.
  it('rejects when the request ends mid-file', async () => {
    const truncated = Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="tour.gpx"\r\n` +
        `Content-Type: application/gpx+xml\r\n\r\n<gpx`,
    );

    await expect(parseMultipart(makeRequest(truncated))).rejects.toThrow('Unexpected end of form');
  });

  it('rejects when the request ends inside the part headers', async () => {
    const truncated = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="tour.gpx"\r\n`,
    );

    await expect(parseMultipart(makeRequest(truncated))).rejects.toThrow('Unexpected end of form');
  });

  it('reassembles a file split across many small chunks', async () => {
    const content = 'x'.repeat(50_000);
    const file = await parseMultipart(makeRequest(multipartBody(content), { chunkSize: 64 }));

    expect(file.buffer.toString()).toBe(content);
  });
});
