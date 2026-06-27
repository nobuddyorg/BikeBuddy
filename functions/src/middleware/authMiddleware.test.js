'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authenticate, openIdConfigUrl } = require('./authMiddleware');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

const TEST_ENV = {
  ENTRA_TENANT_SUBDOMAIN: 'bikebuddy',
  ENTRA_TENANT_ID: 'aaaabbbb-0000-cccc-1111-dddd2222eeee',
  ENTRA_CLIENT_ID: 'test-client-id',
};
const ISSUER = `https://${TEST_ENV.ENTRA_TENANT_ID}.ciamlogin.com/${TEST_ENV.ENTRA_TENANT_ID}/v2.0`;
const now = () => Math.floor(Date.now() / 1000);

// configLoader stub: returns the issuer/jwksUri the middleware would read from
// the OIDC metadata document.
const mockConfig = async () => ({ issuer: ISSUER, jwksUri: 'https://example/keys' });
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
      oid: 'oid-123',
      name: 'Test User',
      email: 'test@example.com',
      aud: TEST_ENV.ENTRA_CLIENT_ID,
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

const run = (req, factory = mockJwks) => authenticate(req, factory, mockConfig);

beforeEach(() => Object.assign(process.env, TEST_ENV));
afterEach(() => {
  for (const k of Object.keys(TEST_ENV)) delete process.env[k];
  delete process.env.SKIP_AUTH;
});

describe('authenticate — success', () => {
  test('valid token resolves userId/userOid/userEmail/userName', async () => {
    const user = await run(bearer(makeToken()));
    expect(user).toEqual({
      userId: 'user-123',
      userOid: 'oid-123',
      userEmail: 'test@example.com',
      userName: 'Test User',
    });
  });

  test('userOid is null when the oid claim is absent', async () => {
    const user = await run(bearer(makeToken({ oid: undefined })));
    expect(user.userOid).toBeNull();
  });

  test.each([
    [
      'preferred_username when email absent',
      { email: undefined, preferred_username: 'alt@example.com' },
      'userEmail',
      'alt@example.com',
    ],
    [
      'null when no email claim',
      { email: undefined, preferred_username: undefined },
      'userEmail',
      null,
    ],
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
    { sub: 'user-123', aud: TEST_ENV.ENTRA_CLIENT_ID, iss: ISSUER, exp: now() + 3600 },
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

describe('External ID configuration helpers', () => {
  test('openIdConfigUrl builds the ciamlogin metadata URL from env', () => {
    expect(openIdConfigUrl()).toBe(
      'https://bikebuddy.ciamlogin.com/aaaabbbb-0000-cccc-1111-dddd2222eeee/v2.0/.well-known/openid-configuration',
    );
  });
});
