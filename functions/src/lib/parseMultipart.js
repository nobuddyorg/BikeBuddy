'use strict';

const Busboy = require('busboy');
const { Readable } = require('stream');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Parse the first file field from a multipart v4 HttpRequest.
 *
 * Resolves with { filename, mimeType, buffer }, or rejects with an Error whose
 * `.status` is 400 for anything the client got wrong.
 *
 * Streamed into busboy rather than read whole: arrayBuffer() allocated the
 * entire payload before any limit could apply, and Content-Length can't prevent
 * that — chunked requests carry none, and the header is attacker-controlled
 * either way (#352).
 *
 * @param {import('@azure/functions').HttpRequest} request
 */
async function parseMultipart(request) {
  const headers = Object.fromEntries(request.headers.entries());

  // Only a shortcut for honestly-declared lengths; the streaming limit below is
  // the real enforcement.
  const contentLength = parseInt(headers['content-length'] ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw badRequest('File exceeds 10 MB limit');
  }

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers,
        // +1 because busboy signals 'limit' on reaching fileSize, not on
        // exceeding it, and a file of exactly 10 MB is accepted by the frontend
        // (lib/files.js). No form fields: tour metadata travels in the query.
        limits: { fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 0 },
      });
    } catch {
      return reject(badRequest('Invalid multipart request'));
    }

    let settled = false;
    function settle(fn, val) {
      if (settled) return;
      settled = true;
      fn(val);
    }

    // A body that stops mid-stream is malformed request syntax, not a server
    // fault, so it must not become a 500 (#383). busboy's own wording is
    // English-only and says nothing the uploader can act on, so it is logged
    // rather than returned.
    const rejectMalformed = (err) => {
      console.warn(`upload: malformed multipart (${err.name}: ${err.message})`);
      settle(reject, badRequest('Invalid multipart request'));
    };

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];

      // The stream is truncated from here on, so the partial buffer is unusable.
      fileStream.on('limit', () => settle(reject, badRequest('File exceeds 10 MB limit')));
      fileStream.on('data', (chunk) => chunks.push(chunk));
      fileStream.on('end', () => {
        settle(resolve, { filename, mimeType, buffer: Buffer.concat(chunks) });
      });
      fileStream.on('error', rejectMalformed);
    });

    busboy.on('error', rejectMalformed);
    busboy.on('finish', () => settle(reject, badRequest('No file field found in request')));

    // Readable.fromWeb(null) throws a bare TypeError, which callers would
    // surface as a 500 rather than a 400.
    if (!request.body) return settle(reject, badRequest('No file field found in request'));

    const body = Readable.fromWeb(request.body);
    body.on('error', rejectMalformed);
    body.pipe(busboy);
  });
}

module.exports = { parseMultipart, MAX_FILE_BYTES };
