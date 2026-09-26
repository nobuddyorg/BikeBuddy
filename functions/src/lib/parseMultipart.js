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

// A 2,000-character description at four bytes a character; a longer value is no tour's.
const MAX_FIELD_BYTES = 8 * 1024;

function createParser(headers, fieldNames) {
  try {
    return Busboy({
      headers,
      // busboy cuts a file or value on reaching its size, and one exactly at the limit is allowed.
      limits: {
        fileSize: MAX_FILE_BYTES + 1,
        files: 1,
        fields: fieldNames.length,
        fieldSize: MAX_FIELD_BYTES + 1,
      },
    });
  } catch (error) {
    // Busboy throws here only for a missing or unusable Content-Type header.
    throw malformedRequest(error);
  }
}

// Only the named fields, each once and whole: anything else is a client that means something else.
function collectFields(parser, { fieldNames, fields, reject }) {
  parser.on('field', (name, value, { valueTruncated }) => {
    if (!fieldNames.includes(name) || name in fields || valueTruncated) {
      reject(badRequest(ERROR_KEYS.invalidUpload));
      return;
    }
    fields[name] = value;
  });
  parser.on('fieldsLimit', () => reject(badRequest(ERROR_KEYS.invalidUpload)));
}

function collectFirstFile(parser, { onFile, reject }) {
  parser.on('file', (_fieldName, fileStream, { filename, mimeType }) => {
    const chunks = [];
    // The stream is truncated from here on, so the partial buffer is unusable.
    fileStream.on('limit', () => reject(badRequest(ERROR_KEYS.fileSize)));
    fileStream.on('data', (chunk) => chunks.push(chunk));
    fileStream.on('end', () => onFile({ filename, mimeType, buffer: Buffer.concat(chunks) }));
    // busboy destroys the file with the parser's own error, which the parser's handler reports.
    fileStream.on('error', () => {});
  });
}

// busboy finishes only once every file stream has ended, so the fields around the file are in.
function collectUpload(parser, { fieldNames, resolve, reject }) {
  const fields = {};
  let file;
  collectFields(parser, { fieldNames, fields, reject });
  collectFirstFile(parser, { onFile: (collected) => (file = collected), reject });
  parser.on('error', (error) => reject(malformedRequest(error)));
  parser.on('finish', () =>
    file ? resolve({ ...file, fields }) : reject(badRequest(ERROR_KEYS.noFile)),
  );
}

/**
 * Streams the first file through busboy, so the size limit bounds memory, with the text fields
 * `fieldNames` allows (#579); client errors get 400.
 *
 * @param {import('@azure/functions').HttpRequest} request
 * @param {{ fieldNames?: string[] }} [options]
 * @returns {Promise<{ filename: string, mimeType: string, buffer: Buffer,
 *   fields: Record<string, string> }>}
 */
async function parseMultipart(request, { fieldNames = [] } = {}) {
  const headers = Object.fromEntries(request.headers.entries());

  // A shortcut for honestly declared lengths only; the stream limit enforces.
  const contentLength = Number(headers['content-length']);
  if (contentLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw badRequest(ERROR_KEYS.fileSize);
  }

  const parser = createParser(headers, fieldNames);
  // Readable.fromWeb(null) throws a bare TypeError, which would become a 500.
  const webBody = request.body;
  if (!webBody) throw badRequest(ERROR_KEYS.noFile);

  // A promise settles once, so whichever of finish or an error comes first decides.
  return new Promise((resolve, reject) => {
    collectUpload(parser, { fieldNames, resolve, reject });

    const body = Readable.fromWeb(webBody);
    body.on('error', (error) => reject(malformedRequest(error)));
    body.pipe(parser);
  });
}

module.exports = { parseMultipart, MAX_FILE_BYTES, MULTIPART_OVERHEAD_BYTES };
