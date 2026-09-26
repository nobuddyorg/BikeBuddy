// @ts-check
'use strict';

const { promisify } = require('node:util');
const zlib = require('node:zlib');

// Below this the saving is a few kilobytes, not worth a round of CPU (#578).
const MIN_COMPRESSED_BYTES = 32 * 1024;

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

// Fast settings: on a 1.9 MB /map body, brotli 4 took about 60 ms and gzip 1 about 25 ms, off the event loop.
const ENCODERS = {
  br: (/** @type {Buffer} */ body) =>
    brotli(body, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    }),
  gzip: (/** @type {Buffer} */ body) => gzip(body, { level: 1 }),
};

/** @param {string} part one entry of an Accept-Encoding header, e.g. `br;q=0.8` */
function offeredCoding(part) {
  const [coding, ...parameters] = part.split(';').map((piece) => piece.trim().toLowerCase());
  const quality = parameters.find((parameter) => parameter.startsWith('q='));
  return { coding, weight: quality ? Number(quality.slice(2)) : 1 };
}

/**
 * The coding to answer with: brotli, else gzip, whichever the client accepts; '' for neither.
 *
 * @param {string | null} acceptEncoding the header, null when the request has none
 */
function chooseEncoding(acceptEncoding) {
  if (!acceptEncoding) return '';
  const accepted = acceptEncoding
    .split(',')
    .map(offeredCoding)
    .filter(({ weight }) => weight > 0)
    .map(({ coding }) => coding);
  return Object.keys(ENCODERS).find((coding) => accepted.includes(coding)) ?? '';
}

/**
 * A JSON response of at least 32 KB, encoded for a client that accepts brotli or gzip.
 *
 * @param {{ jsonBody?: unknown, headers?: Record<string, string> }} response
 * @param {string | null} acceptEncoding
 */
async function compressedResponse(response, acceptEncoding) {
  if (!('jsonBody' in response)) return response;
  const body = Buffer.from(JSON.stringify(response.jsonBody));
  if (body.length < MIN_COMPRESSED_BYTES) return response;
  const headers = { ...response.headers, Vary: 'Accept-Encoding' };
  const coding = chooseEncoding(acceptEncoding);
  if (!coding) return { ...response, headers };
  const encoded = {
    ...response,
    headers: { ...headers, 'Content-Type': 'application/json', 'Content-Encoding': coding },
    body: await ENCODERS[coding](body),
  };
  // The host ignores body while jsonBody is set.
  delete encoded.jsonBody;
  return encoded;
}

/**
 * @param {(request: any, context: any) => Promise<object>} handler
 */
function withCompression(handler) {
  return async (request, context) =>
    compressedResponse(await handler(request, context), request.headers.get('accept-encoding'));
}

module.exports = { MIN_COMPRESSED_BYTES, chooseEncoding, compressedResponse, withCompression };
