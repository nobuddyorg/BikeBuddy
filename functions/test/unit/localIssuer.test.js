'use strict';

// authenticate() with nothing injected but its environment, against the harness's issuer over HTTP:
// the real metadata fetch, the real key set fetch, the loopback override.

const { authenticate } = require('../../src/middleware/authMiddleware');
const { startOidcProvider } = require('../integration/oidcProvider');
const { tokenMinter } = require('../integration/tokens');

const AUDIENCE = 'integration-test-client';
const USER_ID = '0b7e4c1a-2d3f-4a5b-9c6d-7e8f9a0b1c2d';

const bearer = (token) => ({ headers: new Map([['authorization', `Bearer ${token}`]]) });

let issuer;
let environment;
let tokens;

beforeAll(async () => {
  issuer = await startOidcProvider({ audience: AUDIENCE });
  environment = {
    ENTRA_TENANT_SUBDOMAIN: 'integration-test',
    ENTRA_TENANT_ID: '00000000-0000-4000-8000-000000000067',
    ENTRA_CLIENT_ID: AUDIENCE,
    ENTRA_OIDC_METADATA_URL: issuer.metadataUrl,
  };
  tokens = tokenMinter(issuer.signing);
});

afterAll(async () => {
  await issuer.close();
});

async function quietly(action) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    return await action();
  } finally {
    warn.mockRestore();
  }
}

describe('the local issuer', () => {
  test('serves a discovery document naming itself and its key set', async () => {
    const metadata = await (await fetch(issuer.metadataUrl)).json();
    const keySet = await (await fetch(metadata.jwks_uri)).json();

    expect(metadata.issuer).toBe(issuer.signing.issuer);
    expect(new URL(metadata.jwks_uri).hostname).toBe('127.0.0.1');
    expect(keySet.keys).toEqual([
      expect.objectContaining({ kty: 'RSA', kid: issuer.signing.keyId, use: 'sig', alg: 'RS256' }),
    ]);
    expect(keySet.keys[0]).not.toHaveProperty('d');
  });

  test('answers 404 for anything else', async () => {
    const origin = new URL(issuer.metadataUrl).origin;
    expect((await fetch(`${origin}/elsewhere`)).status).toBe(404);
    expect((await fetch(issuer.metadataUrl, { method: 'POST' })).status).toBe(404);
  });
});

describe('authenticate through the loopback override', () => {
  // First, so the key set is cold: 10 of these used to exhaust jwks-rsa's rate limiter (#537).
  test('a burst of unknown key ids on a cold instance does not lock out a valid token', async () => {
    const junk = tokens.unknownKeyTokenFor({ userId: USER_ID });
    for (let index = 0; index < 20; index += 1) {
      expect(await quietly(() => authenticate(bearer(junk), { environment }))).toBeNull();
    }

    const token = tokens.tokenFor({ userId: USER_ID });
    expect(await authenticate(bearer(token), { environment })).toMatchObject({ userId: USER_ID });
  });

  test('accepts a harness token as the user it names', async () => {
    const token = tokens.tokenFor({ userId: USER_ID, claims: { name: 'Rider' } });

    expect(await authenticate(bearer(token), { environment })).toEqual({
      userId: USER_ID,
      userOid: null,
      userEmail: null,
      userName: 'Rider',
    });
  });

  test.each([
    'expired',
    'not valid yet',
    'wrong audience',
    'wrong issuer',
    'signed by another key',
    'alg none',
    'HS256 keyed with the public key',
  ])('refuses the token that is %s', async (label) => {
    const token = tokens.rejectedTokensFor({ userId: USER_ID })[label];
    expect(await quietly(() => authenticate(bearer(token), { environment }))).toBeNull();
  });

  test('refuses a token under a key id the issuer does not publish', async () => {
    const token = tokens.unknownKeyTokenFor({ userId: USER_ID });
    expect(await quietly(() => authenticate(bearer(token), { environment }))).toBeNull();
  });
});
