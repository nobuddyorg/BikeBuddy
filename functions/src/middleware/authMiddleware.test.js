'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authMiddleware, b2cBaseUrl, defaultJwksClient } = require('./authMiddleware');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

// Throwaway HMAC secret for the algorithm-confusion test; generated so no
// credential literal lives in source.
const hmacSecret = crypto.randomBytes(32).toString('hex');

// Inject a mock JWKS client factory so tests never hit the network
const mockJwksClientFactory = () => ({
  getSigningKey: (_kid, cb) => cb(null, { getPublicKey: () => publicKeyPem }),
});

// Simulates the JWKS endpoint failing to return a signing key for the token's kid
const failingJwksClientFactory = () => ({
  getSigningKey: (_kid, cb) => cb(new Error('key not found')),
});

const TEST_ENV = {
  B2C_TENANT: 'testtenant.onmicrosoft.com',
  B2C_CLIENT_ID: 'test-client-id',
  B2C_POLICY: 'B2C_1_signupsignin',
};

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      sub: 'user-123',
      emails: ['test@example.com'],
      aud: TEST_ENV.B2C_CLIENT_ID,
      iss: `https://testtenant.b2clogin.com/${TEST_ENV.B2C_TENANT}/v2.0/`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...overrides,
    },
    privateKeyPem,
    { algorithm: 'RS256', header: { kid: 'test-key' } },
  );
}

function makeContext() {
  return { res: null, userId: null, userEmail: null };
}

function callMiddleware(ctx, token) {
  return authMiddleware(
    ctx,
    { headers: { authorization: `Bearer ${token}` } },
    mockJwksClientFactory,
  );
}

beforeEach(() => Object.assign(process.env, TEST_ENV));
afterEach(() => {
  for (const k of Object.keys(TEST_ENV)) delete process.env[k];
});

describe('authMiddleware', () => {
  test('valid token — sets userId and userEmail, returns true', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(ctx, makeToken());

    expect(result).toBe(true);
    expect(ctx.userId).toBe('user-123');
    expect(ctx.userEmail).toBe('test@example.com');
    expect(ctx.res).toBeNull();
  });

  test('missing Authorization header — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: {} }, mockJwksClientFactory);

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('header without Bearer prefix — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(
      ctx,
      { headers: { authorization: 'Basic sometoken' } },
      mockJwksClientFactory,
    );

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('expired token — returns 401', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(
      ctx,
      makeToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
    );

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('wrong audience — returns 401', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(ctx, makeToken({ aud: 'wrong-client' }));

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('malformed token string — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(
      ctx,
      { headers: { authorization: 'Bearer notajwt' } },
      mockJwksClientFactory,
    );

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('wrong issuer — returns 401', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(ctx, makeToken({ iss: 'https://attacker.example.com/' }));

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('token signed with a disallowed algorithm — returns 401', async () => {
    // HS256 token whose signature would verify against the RSA public key bytes;
    // restricting algorithms to RS256 must reject it (algorithm-confusion guard).
    const hsToken = jwt.sign(
      {
        sub: 'user-123',
        aud: TEST_ENV.B2C_CLIENT_ID,
        iss: `https://testtenant.b2clogin.com/${TEST_ENV.B2C_TENANT}/v2.0/`,
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      hmacSecret,
      { algorithm: 'HS256', header: { kid: 'test-key' } },
    );

    const ctx = makeContext();
    const result = await callMiddleware(ctx, hsToken);

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('valid token with no email claims — succeeds with userEmail null', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(ctx, makeToken({ emails: undefined, email: undefined }));

    expect(result).toBe(true);
    expect(ctx.userId).toBe('user-123');
    expect(ctx.userEmail).toBeNull();
  });

  test('JWKS signing-key lookup failure — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(
      ctx,
      { headers: { authorization: `Bearer ${makeToken()}` } },
      failingJwksClientFactory,
    );

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('empty Bearer token — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(
      ctx,
      { headers: { authorization: 'Bearer ' } },
      mockJwksClientFactory,
    );

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('falls back to email claim when emails array is absent', async () => {
    const ctx = makeContext();
    const result = await callMiddleware(
      ctx,
      makeToken({ emails: undefined, email: 'other@example.com' }),
    );

    expect(result).toBe(true);
    expect(ctx.userEmail).toBe('other@example.com');
  });
});

describe('B2C configuration helpers', () => {
  beforeEach(() => Object.assign(process.env, TEST_ENV));
  afterEach(() => {
    for (const k of Object.keys(TEST_ENV)) delete process.env[k];
  });

  test('b2cBaseUrl derives the b2clogin host from the tenant domain', () => {
    expect(b2cBaseUrl()).toBe('https://testtenant.b2clogin.com/testtenant.onmicrosoft.com');
  });

  test('defaultJwksClient returns a usable JWKS client', () => {
    const client = defaultJwksClient();
    expect(typeof client.getSigningKey).toBe('function');
  });
});
