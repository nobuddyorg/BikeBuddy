'use strict';

const Busboy = require('busboy');
const { Readable } = require('stream');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Parse the first file field from a multipart request.
 *
 * Resolves with { filename, mimeType, buffer } or rejects with an Error
 * whose `.status` property is 400 when the file exceeds MAX_FILE_BYTES.
 */
function parseMultipart(req) {
  // Fast reject on Content-Length before buffering anything.
  const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);
  if (contentLength > MAX_FILE_BYTES) {
    const err = new Error('File exceeds 10 MB limit');
    err.status = 400;
    return Promise.reject(err);
  }

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers });
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

    // With "dataType": "binary" the runtime delivers the body as a Buffer in
    // req.body; req.rawBody may be a (lossy for binary) string. Prefer whichever
    // is already a Buffer so image bytes survive; fall back to a latin1 decode.
    const body = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.isBuffer(req.rawBody)
        ? req.rawBody
        : Buffer.from(req.rawBody ?? '', 'binary');
    const readable = new Readable();
    readable.push(body);
    readable.push(null);
    readable.pipe(busboy);
  });
}

module.exports = { parseMultipart };
