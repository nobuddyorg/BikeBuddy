'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// jest.mock() factories are hoisted but called lazily (at first require).
// Variables prefixed with 'mock' are allowed to be referenced in the factory.
const mockKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const mockPrivateKeyPem = mockKeys.privateKey.export({ type: 'pkcs8', format: 'pem' });
const mockPublicKeyPem = mockKeys.publicKey.export({ type: 'spki', format: 'pem' });

jest.mock('jwks-rsa', () =>
  jest.fn(() => ({
    getSigningKey: (_kid, cb) => cb(null, { getPublicKey: () => mockPublicKeyPem }),
  })),
);

const { authMiddleware } = require('./authMiddleware');

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
    mockPrivateKeyPem,
    { algorithm: 'RS256', header: { kid: 'test-key' } },
  );
}

function makeContext() {
  return { res: null, userId: null, userEmail: null };
}

beforeEach(() => Object.assign(process.env, TEST_ENV));
afterEach(() => { for (const k of Object.keys(TEST_ENV)) delete process.env[k]; });

describe('authMiddleware', () => {
  test('valid token — sets userId and userEmail, returns true', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: `Bearer ${makeToken()}` } });

    expect(result).toBe(true);
    expect(ctx.userId).toBe('user-123');
    expect(ctx.userEmail).toBe('test@example.com');
    expect(ctx.res).toBeNull();
  });

  test('missing Authorization header — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: {} });

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('header without Bearer prefix — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: 'Basic sometoken' } });

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('expired token — returns 401', async () => {
    const token = makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: `Bearer ${token}` } });

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('wrong audience — returns 401', async () => {
    const token = makeToken({ aud: 'wrong-client' });
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: `Bearer ${token}` } });

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('malformed token string — returns 401', async () => {
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: 'Bearer notajwt' } });

    expect(result).toBe(false);
    expect(ctx.res.status).toBe(401);
  });

  test('falls back to email claim when emails array is absent', async () => {
    const token = makeToken({ emails: undefined, email: 'other@example.com' });
    const ctx = makeContext();
    const result = await authMiddleware(ctx, { headers: { authorization: `Bearer ${token}` } });

    expect(result).toBe(true);
    expect(ctx.userEmail).toBe('other@example.com');
  });
});
