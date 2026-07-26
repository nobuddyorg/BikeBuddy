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
 * Resolves with { filename, mimeType, buffer } or rejects with an Error whose
 * `.status` is 400 for client problems (too large, malformed, no file).
 *
 * The body is streamed into busboy rather than materialised up front: reading it
 * whole via arrayBuffer() allocated the entire payload before any limit could
 * apply, and the Content-Length pre-check could not prevent that — a chunked
 * request carries no Content-Length, and the header is attacker-controlled
 * anyway. Size is now capped by busboy as it streams, so an oversized upload is
 * abandoned mid-flight instead of being fully resident in memory first (#352).
 *
 * @param {import('@azure/functions').HttpRequest} request
 */
async function parseMultipart(request) {
  const headers = Object.fromEntries(request.headers.entries());

  // Cheap pre-check so an upload that honestly declares an oversized length is
  // rejected before a single chunk is read. Absent or unparsable lengths fall
  // through to the streaming limit below, which is the real enforcement.
  const contentLength = parseInt(headers['content-length'] ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw badRequest('File exceeds 10 MB limit');
  }

  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({
        headers,
        // fileSize is MAX_FILE_BYTES + 1 because busboy signals 'limit' on
        // reaching the value, not on exceeding it — passing MAX_FILE_BYTES
        // would reject a file of exactly 10 MB, which both the previous
        // `size > MAX_FILE_BYTES` check and the frontend's own validation
        // (lib/files.js) accept.
        // files: 1 — only the first file field is ever used. fields: 0 — this
        // API takes no form fields; tour metadata travels in the query string.
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

    // A body that stops mid-stream — a cancelled upload, a dropped mobile
    // connection, a hand-rolled request — is malformed request syntax, not a
    // server fault, and must not be answered with a 500 (#383). The original is
    // logged rather than returned: busboy's wording is English-only, changes
    // with the library, and says nothing the uploader can act on.
    const rejectMalformed = (err) => {
      console.warn(`upload: malformed multipart (${err.name}: ${err.message})`);
      settle(reject, badRequest('Invalid multipart request'));
    };

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];

      // Emitted once busboy has read limits.fileSize bytes. The stream is
      // truncated from that point, so the partial buffer must not be resolved.
      fileStream.on('limit', () => settle(reject, badRequest('File exceeds 10 MB limit')));
      fileStream.on('data', (chunk) => chunks.push(chunk));
      fileStream.on('end', () => {
        settle(resolve, { filename, mimeType, buffer: Buffer.concat(chunks) });
      });
      fileStream.on('error', rejectMalformed);
    });

    busboy.on('error', rejectMalformed);
    busboy.on('finish', () => settle(reject, badRequest('No file field found in request')));

    // body is null for a bodyless request; Readable.fromWeb would throw a bare
    // TypeError, which callers would surface as a 500 rather than a 400.
    if (!request.body) return settle(reject, badRequest('No file field found in request'));

    const body = Readable.fromWeb(request.body);
    body.on('error', rejectMalformed);
    body.pipe(busboy);
  });
}

module.exports = { parseMultipart, MAX_FILE_BYTES };
