'use strict';

const { parseMultipart, MAX_FILE_BYTES, MULTIPART_OVERHEAD_BYTES } = require('./parseMultipart');

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

// The parser only touches .headers.entries() and .body (a web ReadableStream).
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
              for (let offset = 0; offset < body.length; offset += chunkSize) {
                controller.enqueue(new Uint8Array(body.subarray(offset, offset + chunkSize)));
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
    const request = makeRequest(multipartBody('<gpx/>'), {
      contentLength: MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES + 1,
    });

    await expect(parseMultipart(request)).rejects.toMatchObject({
      status: 400,
      message: 'errors.fileSize',
    });
    expect(request.body.locked).toBe(false);
  });

  it('rejects an oversized upload that declares no Content-Length', async () => {
    const oversized = multipartBody(Buffer.alloc(MAX_FILE_BYTES + 1024, 0x41));

    await expect(parseMultipart(makeRequest(oversized))).rejects.toMatchObject({
      status: 400,
      message: 'errors.fileSize',
    });
  });

  it('rejects an oversized upload that under-declares its Content-Length', async () => {
    const oversized = multipartBody(Buffer.alloc(MAX_FILE_BYTES + 1024, 0x41));

    await expect(
      parseMultipart(makeRequest(oversized, { contentLength: 10 })),
    ).rejects.toMatchObject({ status: 400, message: 'errors.fileSize' });
  });

  it('accepts a file exactly at the limit', async () => {
    const atLimit = multipartBody(Buffer.alloc(MAX_FILE_BYTES, 0x41));
    const file = await parseMultipart(makeRequest(atLimit));

    expect(file.buffer.length).toBe(MAX_FILE_BYTES);
  });

  // A browser declares the whole body, so the file's own 10 MB plus the multipart framing.
  it('accepts a file at the limit whose Content-Length counts the multipart framing', async () => {
    const atLimit = multipartBody(Buffer.alloc(MAX_FILE_BYTES, 0x41));
    const request = makeRequest(atLimit, { contentLength: atLimit.length });

    const file = await parseMultipart(request);

    expect(atLimit.length).toBeGreaterThan(MAX_FILE_BYTES);
    expect(file.buffer.length).toBe(MAX_FILE_BYTES);
  });

  it('still reads the body when the declared length is at most the limit plus framing', async () => {
    const request = makeRequest(multipartBody('<gpx/>'), {
      contentLength: MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES,
    });

    expect((await parseMultipart(request)).buffer.toString()).toBe('<gpx/>');
  });

  it('rejects a malformed multipart request (no boundary)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const request = makeRequest(multipartBody('<gpx/>'), {
        contentType: 'multipart/form-data',
      });

      await expect(parseMultipart(request)).rejects.toMatchObject({
        status: 400,
        message: 'errors.invalidUpload',
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Boundary not found'));
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects when there is no file field', async () => {
    const noFile = Buffer.from(`--${BOUNDARY}--\r\n`);

    await expect(parseMultipart(makeRequest(noFile))).rejects.toMatchObject({
      status: 400,
      message: 'errors.noFile',
    });
  });

  it('rejects a request with no body at all', async () => {
    await expect(parseMultipart(makeRequest(null))).rejects.toMatchObject({
      status: 400,
      message: 'errors.noFile',
    });
  });

  it('rejects when the body stream errors mid-transfer', async () => {
    const request = makeRequest(multipartBody('<gpx/>'));
    request.body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from(`--${BOUNDARY}\r\n`)));
        controller.error(new Error('connection reset'));
      },
    });

    // The client dropped the connection; a 500 would blame the server.
    await expect(parseMultipart(request)).rejects.toMatchObject({
      status: 400,
      message: 'errors.invalidUpload',
    });
  });

  // A dropped connection surfaces on the file stream or on busboy; both must settle as a 400.
  it('rejects a request that ends mid-file as a client error', async () => {
    const truncated = Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="tour.gpx"\r\n` +
        `Content-Type: application/gpx+xml\r\n\r\n<gpx`,
    );

    await expect(parseMultipart(makeRequest(truncated))).rejects.toMatchObject({
      status: 400,
      message: 'errors.invalidUpload',
    });
  });

  it('rejects a request that ends inside the part headers as a client error', async () => {
    const truncated = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="tour.gpx"\r\n`,
    );

    await expect(parseMultipart(makeRequest(truncated))).rejects.toMatchObject({
      status: 400,
      message: 'errors.invalidUpload',
    });
  });

  it('logs the underlying parser error without returning it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const truncated = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="tour.gpx"\r\n`,
    );

    await expect(parseMultipart(makeRequest(truncated))).rejects.toMatchObject({ status: 400 });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected end of form'));
    warn.mockRestore();
  });

  it('reassembles a file split across many small chunks', async () => {
    const content = 'x'.repeat(50_000);
    const file = await parseMultipart(makeRequest(multipartBody(content), { chunkSize: 64 }));

    expect(file.buffer.toString()).toBe(content);
  });
});
