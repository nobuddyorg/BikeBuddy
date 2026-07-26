'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  authenticate,
  openIdConfigUrl,
  getOpenIdConfig,
  defaultJwksClient,
} = require('./authMiddleware');

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
// The token's kid is genuinely absent from the tenant's JWKS — the caller's
// fault, so this stays a 401. jwks-rsa signals it with this error name.
const failingJwks = () => ({
  getSigningKey: async () => {
    throw Object.assign(new Error('key not found'), { name: 'SigningKeyNotFoundError' });
  },
});

// The JWKS endpoint itself is unreachable — not the caller's fault.
const unreachableJwks = () => ({
  getSigningKey: async () => {
    throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'FetchError' });
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
      'emails[] array fallback',
      { email: undefined, preferred_username: undefined, emails: ['array@example.com'] },
      'userEmail',
      'array@example.com',
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
    ['unknown signing key (kid not in JWKS)', bearer(makeToken()), failingJwks],
  ])('returns null for %s', async (_label, req, factory) => {
    expect(await run(req, factory)).toBeNull();
  });
});

// Returning null here would answer 401, telling every correctly-authenticated
// user they are signed out for the duration of an upstream outage. These must
// propagate so callers surface a retryable 5xx instead (#358).
describe('authenticate — infrastructure failures propagate', () => {
  test('rethrows when the JWKS endpoint is unreachable', async () => {
    await expect(run(bearer(makeToken()), unreachableJwks)).rejects.toThrow(
      'getaddrinfo ENOTFOUND',
    );
  });

  test('rethrows when the OIDC metadata document cannot be loaded', async () => {
    const failingConfig = async () => {
      throw new Error('OIDC metadata fetch failed: 503');
    };
    await expect(authenticate(bearer(makeToken()), mockJwks, failingConfig)).rejects.toThrow(
      'OIDC metadata fetch failed: 503',
    );
  });

  test('a malformed token is still rejected, not thrown, before any network call', async () => {
    const neverCalled = async () => {
      throw new Error('config should not be loaded for a malformed token');
    };
    expect(await authenticate(bearer('notajwt'), mockJwks, neverCalled)).toBeNull();
  });
});

describe('authenticate — SKIP_AUTH dev bypass', () => {
  beforeEach(() => {
    process.env.SKIP_AUTH = 'true';
  });

  test('returns a hardcoded dev user without a token', async () => {
    for (const key of Object.keys(TEST_ENV)) delete process.env[key];

    const user = await authenticate({ headers: new Map() });
    expect(user).toEqual({
      userId: 'local-dev-user',
      userEmail: 'dev@localhost',
      userName: 'Local Dev',
    });
  });

  // A deployment that has both real auth configured and the bypass switched on
  // would otherwise serve every anonymous caller as the same shared user (#361).
  test('refuses the bypass when a client id is configured', async () => {
    delete process.env.ENTRA_TENANT_ID;

    await expect(authenticate({ headers: new Map() })).rejects.toThrow(
      'SKIP_AUTH must not be set when Entra auth is configured',
    );
  });

  test('refuses the bypass when a tenant id is configured', async () => {
    delete process.env.ENTRA_CLIENT_ID;

    await expect(authenticate({ headers: new Map() })).rejects.toThrow(
      'SKIP_AUTH must not be set when Entra auth is configured',
    );
  });

  // Tofu always writes the Entra app settings, empty until the tenant exists —
  // an empty value must stay a dev environment, not a refusal.
  test('honours the bypass when the Entra settings are present but empty', async () => {
    Object.assign(process.env, { ENTRA_CLIENT_ID: '', ENTRA_TENANT_ID: '' });

    const user = await authenticate({ headers: new Map() });
    expect(user.userId).toBe('local-dev-user');
  });
});

describe('External ID configuration helpers', () => {
  test('openIdConfigUrl builds the ciamlogin metadata URL from env', () => {
    expect(openIdConfigUrl()).toBe(
      'https://bikebuddy.ciamlogin.com/aaaabbbb-0000-cccc-1111-dddd2222eeee/v2.0/.well-known/openid-configuration',
    );
  });
});

describe('getOpenIdConfig', () => {
  const doc = {
    issuer: 'https://tenant.ciamlogin.com/v2.0',
    jwks_uri: 'https://tenant.ciamlogin.com/keys',
  };

  test('throws when the metadata endpoint returns a non-ok status', async () => {
    const failFetch = async () => ({ ok: false, status: 503 });
    await expect(getOpenIdConfig(failFetch)).rejects.toThrow('OIDC metadata fetch failed: 503');
  });

  test('fetches metadata and caches the result on subsequent calls', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => doc });
    const config1 = await getOpenIdConfig(fetchFn);
    const config2 = await getOpenIdConfig(fetchFn);
    expect(config1).toEqual({ issuer: doc.issuer, jwksUri: doc.jwks_uri });
    expect(config2).toBe(config1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // Without a TTL an issuer or jwks_uri change stays invisible until the warm
  // instance recycles, which can be a very long time.
  test('re-fetches once the cache TTL has elapsed (#358)', async () => {
    const TTL = 60 * 60 * 1000;
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => doc });
    // Drive a synthetic clock, starting past the TTL so this does not depend on
    // whatever the earlier tests in this file left in the module-level cache.
    let clock = Date.now() + TTL + 1;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      await getOpenIdConfig(fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      await getOpenIdConfig(fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(1); // still within the new TTL

      clock += TTL + 1;
      await getOpenIdConfig(fetchFn);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('defaultJwksClient', () => {
  test('creates a jwks-rsa client and caches it', () => {
    const first = defaultJwksClient('https://example.com/keys');
    const second = defaultJwksClient('https://example.com/keys');
    expect(typeof first.getSigningKey).toBe('function');
    expect(second).toBe(first);
  });
});
