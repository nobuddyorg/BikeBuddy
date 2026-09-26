'use strict';

// The harness's tokens against the real authenticate(), offline: key source and metadata injected.

const { createPublicKey, createSecretKey, generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../src/middleware/authMiddleware');
const { tokenMinter } = require('../integration/tokens');

const privateKeyPem = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();

const SIGNING = {
  issuer: 'http://127.0.0.1:43123/integration-tenant/v2.0',
  audience: 'integration-test-client',
  keyId: 'integration-key',
  privateKeyPem: privateKeyPem(),
  foreignPrivateKeyPem: privateKeyPem(),
};
const NOW_MS = Date.UTC(2026, 5, 1, 12, 0, 0, 500);
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const USER_ID = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';

// Built inside each test, so a test always runs the module's current code.
const minter = () => tokenMinter(SIGNING, { now: () => NOW_MS });
const tokenFor = (options) => minter().tokenFor(options);
const rejectedTokensFor = (options) => minter().rejectedTokensFor(options);
const unknownKeyTokenFor = (options) => minter().unknownKeyTokenFor(options);

const SPKI_PEM = { type: 'spki', format: 'pem' };

// Serves only the issuer's key under its kid, like the harness's key set.
const publishedKeys = () => ({
  getSigningKey: async (keyId) => {
    if (keyId !== SIGNING.keyId) {
      throw Object.assign(new Error(`no key ${keyId}`), { name: 'SigningKeyNotFoundError' });
    }
    return { getPublicKey: () => createPublicKey(SIGNING.privateKeyPem).export(SPKI_PEM) };
  },
});

const bearer = (token) => ({ headers: new Map([['authorization', `Bearer ${token}`]]) });

function authenticateAt(token, nowMs = NOW_MS) {
  return authenticate(bearer(token), {
    jwksClientFactory: publishedKeys,
    configLoader: async () => ({ issuer: SIGNING.issuer, jwksUri: 'http://127.0.0.1/keys' }),
    environment: { ENTRA_CLIENT_ID: SIGNING.audience },
    now: () => nowMs,
  });
}

// The reason authenticate() logged for its refusal.
async function refusalReason(token) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(await authenticateAt(token)).toBeNull();
    return warn.mock.calls.map(([message]) => message).join('\n');
  } finally {
    warn.mockRestore();
  }
}

describe('tokenFor', () => {
  test('is accepted as the user it names', async () => {
    expect(await authenticateAt(tokenFor({ userId: USER_ID }))).toEqual({
      userId: USER_ID,
      userOid: null,
      userEmail: null,
      userName: null,
    });
  });

  test('carries the extra claims it is given', async () => {
    const token = tokenFor({
      userId: USER_ID,
      claims: { oid: 'object-id', email: 'rider@integration.test', name: 'Rider' },
    });
    expect(await authenticateAt(token)).toEqual({
      userId: USER_ID,
      userOid: 'object-id',
      userEmail: 'rider@integration.test',
      userName: 'Rider',
    });
  });

  test('is an RS256 token under the published key id, valid for an hour from the clock', () => {
    const { header, payload } = jwt.decode(tokenFor({ userId: USER_ID }), { complete: true });

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: SIGNING.keyId });
    expect(payload).toEqual({
      sub: USER_ID,
      aud: SIGNING.audience,
      iss: SIGNING.issuer,
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 3600,
      scp: 'access_as_user',
    });
  });

  test('expires after its hour, not before', async () => {
    const token = tokenFor({ userId: USER_ID });
    expect(await authenticateAt(token, NOW_MS + 3599_000)).not.toBeNull();
    expect(await authenticateAt(token, (NOW_SECONDS + 3600) * 1000)).toBeNull();
  });
});

describe('rejectedTokensFor', () => {
  let rejected;
  beforeEach(() => {
    rejected = rejectedTokensFor({ userId: USER_ID });
  });

  test('offers exactly these reasons', () => {
    expect(Object.keys(rejected)).toEqual([
      'expired',
      'not valid yet',
      'wrong audience',
      'wrong issuer',
      'signed by another key',
      'alg none',
      'HS256 keyed with the public key',
      'no scope',
      'ID token for the same client',
      'another scope',
    ]);
  });

  test.each([
    ['expired', 'TokenExpiredError'],
    ['not valid yet', 'NotBeforeError'],
    ['wrong audience', 'jwt audience invalid'],
    ['wrong issuer', 'jwt issuer invalid'],
    ['signed by another key', 'invalid signature'],
    ['alg none', 'jwt signature is required'],
    ['HS256 keyed with the public key', 'invalid algorithm'],
    ['no scope', 'lacks the access_as_user scope'],
    ['ID token for the same client', 'lacks the access_as_user scope'],
    ['another scope', 'lacks the access_as_user scope'],
  ])('%s is refused for that reason alone', async (label, reason) => {
    expect(await refusalReason(rejected[label])).toContain(reason);
  });

  test('each names the user and the published key id, so only its flaw is wrong', () => {
    for (const token of Object.values(rejected)) {
      const { header, payload } = jwt.decode(token, { complete: true });
      expect(payload.sub).toBe(USER_ID);
      expect(header.kid).toBe(SIGNING.keyId);
    }
  });

  test('keeps the other claims valid around the flawed one', () => {
    const claimsOf = (label) => jwt.decode(rejected[label]);
    expect(claimsOf('expired')).toMatchObject({
      iat: NOW_SECONDS - 3600,
      exp: NOW_SECONDS - 300,
    });
    expect(claimsOf('not valid yet')).toMatchObject({
      nbf: NOW_SECONDS + 300,
      exp: NOW_SECONDS + 3600,
    });
    expect(claimsOf('wrong audience').aud).toBe(`${SIGNING.audience}-other`);
    expect(new URL(claimsOf('wrong issuer').iss).origin).not.toBe(new URL(SIGNING.issuer).origin);
    expect(claimsOf('no scope')).not.toHaveProperty('scp');
    expect(claimsOf('ID token for the same client')).not.toHaveProperty('scp');
    // What makes it an ID token rather than a second 'no scope' case.
    expect(claimsOf('ID token for the same client').nonce).toBeTruthy();
    expect(claimsOf('ID token for the same client').aud).toBe(SIGNING.audience);
    expect(claimsOf('another scope').scp).toBe('User.Read');
    expect(claimsOf('HS256 keyed with the public key')).toMatchObject({
      aud: SIGNING.audience,
      iss: SIGNING.issuer,
    });
  });

  test('HS256 is a valid HMAC keyed with the published public key', () => {
    const token = rejected['HS256 keyed with the public key'];
    const publicKeyAsSecret = createSecretKey(
      Buffer.from(createPublicKey(SIGNING.privateKeyPem).export(SPKI_PEM)),
    );

    expect(jwt.decode(token, { complete: true }).header).toEqual({
      alg: 'HS256',
      typ: 'JWT',
      kid: SIGNING.keyId,
    });
    expect(
      jwt.verify(token, publicKeyAsSecret, { algorithms: ['HS256'], clockTimestamp: NOW_SECONDS }),
    ).toMatchObject({ sub: USER_ID, aud: SIGNING.audience, iss: SIGNING.issuer });
  });

  test('alg none carries no signature at all', () => {
    expect(rejected['alg none']).toMatch(/^[\w-]+\.[\w-]+\.$/);
    expect(jwt.decode(rejected['alg none'], { complete: true }).header.alg).toBe('none');
  });
});

describe('unknownKeyTokenFor', () => {
  test('is signed under a key id the issuer does not publish', async () => {
    const token = unknownKeyTokenFor({ userId: USER_ID });

    const { header, payload } = jwt.decode(token, { complete: true });

    expect(header.kid).toBe(`${SIGNING.keyId}-unknown`);
    expect(payload).toMatchObject({ sub: USER_ID, aud: SIGNING.audience, iss: SIGNING.issuer });
    expect(await refusalReason(token)).toContain('SigningKeyNotFoundError');
  });
});

describe('tokenMinter clock', () => {
  test('reads the real clock by default', () => {
    const before = Math.floor(Date.now() / 1000);
    const { iat } = jwt.decode(tokenMinter(SIGNING).tokenFor({ userId: USER_ID }));
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });
});
