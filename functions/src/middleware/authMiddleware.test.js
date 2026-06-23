'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticate, b2cBaseUrl, defaultJwksClient } = require('./authMiddleware');

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
      name: 'Test User',
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

// v4 request: headers is a Map/Headers exposing .get().
const bearer = (token) => ({ headers: new Map([['authorization', `Bearer ${token}`]]) });

const run = (req, factory = mockJwks) => authenticate(req, factory);

beforeEach(() => Object.assign(process.env, TEST_ENV));
afterEach(() => {
  for (const k of Object.keys(TEST_ENV)) delete process.env[k];
  delete process.env.SKIP_AUTH;
});

describe('authenticate — success', () => {
  test('valid token resolves userId/userEmail/userName', async () => {
    const user = await run(bearer(makeToken()));
    expect(user).toEqual({
      userId: 'user-123',
      userEmail: 'test@example.com',
      userName: 'Test User',
    });
  });

  test.each([
    [
      'email claim when emails[] absent',
      { emails: undefined, email: 'alt@example.com' },
      'userEmail',
      'alt@example.com',
    ],
    ['null when no email claim', { emails: undefined, email: undefined }, 'userEmail', null],
    [
      'given_name fallback when name absent',
      { name: undefined, given_name: 'Ada' },
      'userName',
      'Ada',
    ],
    [
      'null userName when no name claims',
      { name: undefined, given_name: undefined },
      'userName',
      null,
    ],
  ])('resolves %s', async (_label, claims, field, expected) => {
    const user = await run(bearer(makeToken(claims)));
    expect(user[field]).toBe(expected);
  });
});

describe('authenticate — rejection (null)', () => {
  const hsToken = jwt.sign(
    { sub: 'user-123', aud: TEST_ENV.B2C_CLIENT_ID, iss: ISSUER, exp: now() + 3600 },
    crypto.randomBytes(32).toString('hex'),
    { algorithm: 'HS256', header: { kid: 'test-key' } },
  );

  test.each([
    ['missing Authorization header', { headers: new Map() }],
    ['non-Bearer scheme', { headers: new Map([['authorization', 'Basic sometoken']]) }],
    ['malformed token', bearer('notajwt')],
    ['expired token', bearer(makeToken({ exp: now() - 60 }))],
    ['wrong audience', bearer(makeToken({ aud: 'wrong-client' }))],
    ['wrong issuer', bearer(makeToken({ iss: 'https://attacker.example.com/' }))],
    ['disallowed algorithm (HS256)', bearer(hsToken)],
    ['JWKS signing-key lookup failure', bearer(makeToken()), failingJwks],
  ])('returns null for %s', async (_label, req, factory) => {
    expect(await run(req, factory)).toBeNull();
  });
});

describe('authenticate — SKIP_AUTH dev bypass', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
  });

  test('returns a hardcoded dev user without a token', async () => {
    const user = await authenticate({ headers: new Map() });
    expect(user).toEqual({
      userId: 'local-dev-user',
      userEmail: 'dev@localhost',
      userName: 'Local Dev',
    });
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
