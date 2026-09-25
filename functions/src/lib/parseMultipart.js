// @ts-check
'use strict';

const Busboy = require('busboy');
const { Readable } = require('stream');

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function badRequest(message) {
  const error = /** @type {Error & { status?: number }} */ (new Error(message));
  error.status = 400;
  return error;
}

// busboy's wording is logged, not returned: it says nothing an uploader can act on.
function malformedRequest(error) {
  console.warn(`upload: malformed multipart (${error.name}: ${error.message})`);
  return badRequest('Invalid multipart request');
}

function createParser(headers) {
  try {
    return Busboy({
      headers,
      // busboy fires 'limit' on reaching fileSize, and a file of exactly 10 MB is allowed.
      limits: { fileSize: MAX_FILE_BYTES + 1, files: 1, fields: 0 },
    });
  } catch (error) {
    // Busboy throws here only for a missing or unusable Content-Type header.
    throw malformedRequest(error);
  }
}

function collectFirstFile(parser, { resolve, reject }) {
  parser.on('file', (_fieldName, fileStream, { filename, mimeType }) => {
    const chunks = [];
    // The stream is truncated from here on, so the partial buffer is unusable.
    fileStream.on('limit', () => reject(badRequest('File exceeds 10 MB limit')));
    fileStream.on('data', (chunk) => chunks.push(chunk));
    fileStream.on('end', () => resolve({ filename, mimeType, buffer: Buffer.concat(chunks) }));
    fileStream.on('error', (error) => reject(malformedRequest(error)));
  });
  parser.on('error', (error) => reject(malformedRequest(error)));
  parser.on('finish', () => reject(badRequest('No file field found in request')));
}

/**
 * Streams the first file through busboy, so the size limit bounds memory; client errors get 400.
 *
 * @param {import('@azure/functions').HttpRequest} request
 * @returns {Promise<{ filename: string, mimeType: string, buffer: Buffer }>}
 */
async function parseMultipart(request) {
  const headers = Object.fromEntries(request.headers.entries());

  // A shortcut for honestly declared lengths only; the stream limit enforces.
  const contentLength = parseInt(headers['content-length'] ?? '', 10);
  if (contentLength > MAX_FILE_BYTES) throw badRequest('File exceeds 10 MB limit');

  const parser = createParser(headers);
  // Readable.fromWeb(null) throws a bare TypeError, which would become a 500.
  const webBody = request.body;
  if (!webBody) throw badRequest('No file field found in request');

  return new Promise((resolve, reject) => {
    let settled = false;
    const once = (settle) => (value) => {
      if (settled) return;
      settled = true;
      settle(value);
    };
    const rejectOnce = once(reject);
    collectFirstFile(parser, { resolve: once(resolve), reject: rejectOnce });

    const body = Readable.fromWeb(webBody);
    body.on('error', (error) => rejectOnce(malformedRequest(error)));
    body.pipe(parser);
  });
}

module.exports = { parseMultipart, MAX_FILE_BYTES };
