'use strict';

const Busboy = require('busboy');
const { Readable } = require('stream');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Parse the first file field from a multipart v4 HttpRequest.
 *
 * Resolves with { filename, mimeType, buffer } or rejects with an Error whose
 * `.status` is 400 for client problems (too large, malformed, no file).
 */
async function parseMultipart(request) {
  const headers = Object.fromEntries(request.headers.entries());

  // Fast reject on Content-Length before buffering anything.
  const contentLength = parseInt(headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_FILE_BYTES) {
    const err = new Error('File exceeds 10 MB limit');
    err.status = 400;
    throw err;
  }

  const body = Buffer.from(await request.arrayBuffer());

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers });
    } catch {
      const err = new Error('Invalid multipart request');
      err.status = 400;
      return reject(err);
    }

    let settled = false;
    function settle(fn, val) {
      if (settled) return;
      settled = true;
      fn(val);
    }

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      let size = 0;

      fileStream.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) {
          fileStream.destroy();
          const err = new Error('File exceeds 10 MB limit');
          err.status = 400;
          settle(reject, err);
          return;
        }
        chunks.push(chunk);
      });

      fileStream.on('end', () => {
        settle(resolve, { filename, mimeType, buffer: Buffer.concat(chunks) });
      });

      fileStream.on('error', (err) => settle(reject, err));
    });

    busboy.on('error', (err) => settle(reject, err));
    busboy.on('finish', () => {
      if (!settled) {
        const err = new Error('No file field found in request');
        err.status = 400;
        settle(reject, err);
      }
    });

    Readable.from(body).pipe(busboy);
  });
}

module.exports = { parseMultipart };
