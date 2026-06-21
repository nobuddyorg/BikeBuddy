'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authMiddleware, b2cBaseUrl, defaultJwksClient } = require('./authMiddleware');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

const TEST_ENV = {
  B2C_TENANT: 'testtenant.onmicrosoft.com',
  B2C_CLIENT_ID: 'test-client-id',
  B2C_POLICY: 'B2C_1_signupsignin',
};
const ISSUER = `https://testtenant.b2clogin.com/${TEST_ENV.B2C_TENANT}/v2.0/`;
const now = () => Math.floor(Date.now() / 1000);

// JWKS factories — never hit the network: one returns our public key, the other fails.
// getSigningKey mirrors jwks-rsa's promise API (await client.getSigningKey(kid)).
const mockJwks = () => ({ getSigningKey: async () => ({ getPublicKey: () => publicKeyPem }) });
const failingJwks = () => ({
  getSigningKey: async () => {
    throw new Error('key not found');
  },
});

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      sub: 'user-123',
      emails: ['test@example.com'],
      aud: TEST_ENV.B2C_CLIENT_ID,
      iss: ISSUER,
      exp: now() + 3600,
      ...overrides,
    },
    privateKeyPem,
    { algorithm: 'RS256', header: { kid: 'test-key' } },
  );
}

const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });

// Runs the middleware against a fresh context and returns both for assertion.
async function run(req, factory = mockJwks) {
  const ctx = { res: null, userId: null, userEmail: null };
  const ok = await authMiddleware(ctx, req, factory);
  return { ok, ctx };
}

beforeEach(() => Object.assign(process.env, TEST_ENV));
afterEach(() => {
  for (const k of Object.keys(TEST_ENV)) delete process.env[k];
});

describe('authMiddleware — success', () => {
  test('valid token attaches userId/userEmail and returns true', async () => {
    const { ok, ctx } = await run(bearer(makeToken()));
    expect(ok).toBe(true);
    expect(ctx.userId).toBe('user-123');
    expect(ctx.userEmail).toBe('test@example.com');
    expect(ctx.res).toBeNull();
  });

  test.each([
    [
      'email claim when emails[] is absent',
      { emails: undefined, email: 'alt@example.com' },
      'alt@example.com',
    ],
    ['null when no email claim is present', { emails: undefined, email: undefined }, null],
  ])('resolves %s', async (_label, claims, expected) => {
    const { ok, ctx } = await run(bearer(makeToken(claims)));
    expect(ok).toBe(true);
    expect(ctx.userEmail).toBe(expected);
  });
});

describe('authMiddleware — rejection (401)', () => {
  // HS256 token: must be rejected because only RS256 is allowed (algorithm-confusion guard).
  const hsToken = jwt.sign(
    { sub: 'user-123', aud: TEST_ENV.B2C_CLIENT_ID, iss: ISSUER, exp: now() + 3600 },
    crypto.randomBytes(32).toString('hex'),
    {
      algorithm: 'HS256',
      header: { kid: 'test-key' },
    },
  );

  test.each([
    ['missing Authorization header', { headers: {} }],
    ['non-Bearer scheme', { headers: { authorization: 'Basic sometoken' } }],
    ['malformed token', bearer('notajwt')],
    ['expired token', bearer(makeToken({ exp: now() - 60 }))],
    ['wrong audience', bearer(makeToken({ aud: 'wrong-client' }))],
    ['wrong issuer', bearer(makeToken({ iss: 'https://attacker.example.com/' }))],
    ['disallowed algorithm (HS256)', bearer(hsToken)],
    ['JWKS signing-key lookup failure', bearer(makeToken()), failingJwks],
  ])('rejects %s', async (_label, req, factory) => {
    const { ok, ctx } = await run(req, factory);
    expect(ok).toBe(false);
    expect(ctx.res.status).toBe(401);
  });
});

describe('B2C configuration helpers', () => {
  test('b2cBaseUrl derives the b2clogin host from the tenant domain', () => {
    expect(b2cBaseUrl()).toBe('https://testtenant.b2clogin.com/testtenant.onmicrosoft.com');
  });

  test('defaultJwksClient returns a usable JWKS client', () => {
    expect(typeof defaultJwksClient().getSigningKey).toBe('function');
  });
});
