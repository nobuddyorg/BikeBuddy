// @ts-check
'use strict';

const Busboy = require('busboy');
const { Readable } = require('stream');
const { ERROR_KEYS } = require('./http');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Boundaries and part headers around the file: a file at the limit must pass the shortcut.
const MULTIPART_OVERHEAD_BYTES = 16 * 1024;

function badRequest(message) {
  const error = /** @type {Error & { status?: number }} */ (new Error(message));
  error.status = 400;
  return error;
}

// busboy's wording is logged, not returned: it says nothing an uploader can act on.
function malformedRequest(error) {
  console.warn(`upload: malformed multipart (${error.name}: ${error.message})`);
  return badRequest(ERROR_KEYS.invalidUpload);
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
    fileStream.on('limit', () => reject(badRequest(ERROR_KEYS.fileSize)));
    fileStream.on('data', (chunk) => chunks.push(chunk));
    fileStream.on('end', () => resolve({ filename, mimeType, buffer: Buffer.concat(chunks) }));
    // busboy destroys the file with the parser's own error, which the parser's handler reports.
    fileStream.on('error', () => {});
  });
  parser.on('error', (error) => reject(malformedRequest(error)));
  parser.on('finish', () => reject(badRequest(ERROR_KEYS.noFile)));
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
  const contentLength = Number(headers['content-length']);
  if (contentLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw badRequest(ERROR_KEYS.fileSize);
  }

  const parser = createParser(headers);
  // Readable.fromWeb(null) throws a bare TypeError, which would become a 500.
  const webBody = request.body;
  if (!webBody) throw badRequest(ERROR_KEYS.noFile);

  // A promise settles once, so whichever of file, finish or error comes first decides.
  return new Promise((resolve, reject) => {
    collectFirstFile(parser, { resolve, reject });

    const body = Readable.fromWeb(webBody);
    body.on('error', (error) => reject(malformedRequest(error)));
    body.pipe(parser);
  });
}

module.exports = { parseMultipart, MAX_FILE_BYTES, MULTIPART_OVERHEAD_BYTES };
