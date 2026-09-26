'use strict';

const zlib = require('node:zlib');
const {
  MIN_COMPRESSED_BYTES,
  chooseEncoding,
  compressedResponse,
  withCompression,
} = require('./compression');

// JSON.stringify wraps a string in two quotes.
const jsonBodyOfBytes = (bytes) => 'x'.repeat(bytes - 2);
const large = { status: 200, jsonBody: { points: Array(5000).fill([48.1, 11.5]) } };

describe('chooseEncoding', () => {
  it.each([
    ['gzip, deflate, br', 'br'],
    ['br', 'br'],
    ['gzip', 'gzip'],
    ['GZIP;q=0.5', 'gzip'],
    ['gzip;level=1', 'gzip'],
    ['br;q=0, gzip', 'gzip'],
    ['br; q=0.0, gzip;q=0', ''],
    ['deflate, identity', ''],
    ['', ''],
    [null, ''],
  ])('answers %j with %j', (acceptEncoding, coding) => {
    expect(chooseEncoding(acceptEncoding)).toBe(coding);
  });
});

describe('compressedResponse', () => {
  it('leaves a body under 32 KB as it is', async () => {
    const small = { status: 200, jsonBody: jsonBodyOfBytes(MIN_COMPRESSED_BYTES - 1) };

    expect(await compressedResponse(small, 'br')).toBe(small);
  });

  it('encodes a body of exactly 32 KB', async () => {
    const response = { status: 200, jsonBody: jsonBodyOfBytes(32 * 1024) };

    const encoded = await compressedResponse(response, 'gzip');

    expect(encoded.headers['Content-Encoding']).toBe('gzip');
    expect(JSON.parse(zlib.gunzipSync(encoded.body).toString())).toBe(response.jsonBody);
  });

  it('answers brotli with the same JSON, keeping the status and headers', async () => {
    const response = { ...large, status: 201, headers: { Location: '/api/v1/tours/t1' } };

    const encoded = await compressedResponse(response, 'gzip, br');

    expect(encoded).toMatchObject({
      status: 201,
      headers: {
        Location: '/api/v1/tours/t1',
        'Content-Type': 'application/json',
        'Content-Encoding': 'br',
        Vary: 'Accept-Encoding',
      },
    });
    expect(encoded).not.toHaveProperty('jsonBody');
    expect(encoded.body.length).toBeLessThan(JSON.stringify(large.jsonBody).length);
    expect(JSON.parse(zlib.brotliDecompressSync(encoded.body).toString())).toEqual(large.jsonBody);
  });

  // The measured fast settings; the defaults (brotli 11, gzip 6) cost several times the CPU.
  it.each([
    [
      'br',
      (body) =>
        zlib.brotliCompressSync(body, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
          },
        }),
    ],
    ['gzip', (body) => zlib.gzipSync(body, { level: 1 })],
  ])('encodes %s at its fast setting', async (coding, reference) => {
    const encoded = await compressedResponse(large, coding);

    expect(encoded.body).toEqual(reference(Buffer.from(JSON.stringify(large.jsonBody))));
  });

  it('sends a large body plain, but varied, to a client that accepts neither coding', async () => {
    const plain = await compressedResponse(large, 'identity');

    expect(plain).toEqual({ ...large, headers: { Vary: 'Accept-Encoding' } });
  });

  it('leaves a response without a JSON body alone', async () => {
    const noContent = { status: 204 };

    expect(await compressedResponse(noContent, 'br')).toBe(noContent);
  });
});

describe('withCompression', () => {
  const requestAccepting = (acceptEncoding) => ({
    headers: new Headers(acceptEncoding ? { 'Accept-Encoding': acceptEncoding } : {}),
  });

  it("encodes the handler's response for the request's Accept-Encoding", async () => {
    const handler = vi.fn(async () => large);
    const request = requestAccepting('gzip');
    const context = { invocationId: 'inv-1' };

    const response = await withCompression(handler)(request, context);

    expect(handler).toHaveBeenCalledWith(request, context);
    expect(response.headers['Content-Encoding']).toBe('gzip');
  });

  it('sends it plain when the request names no coding', async () => {
    const response = await withCompression(async () => large)(requestAccepting(''), {});

    expect(response.jsonBody).toBe(large.jsonBody);
    expect(response.headers).not.toHaveProperty('Content-Encoding');
  });
});
