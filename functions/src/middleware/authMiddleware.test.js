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

const ENTRA_ENVIRONMENT = {
  ENTRA_TENANT_SUBDOMAIN: 'bikebuddy',
  ENTRA_TENANT_ID: 'aaaabbbb-0000-cccc-1111-dddd2222eeee',
  ENTRA_CLIENT_ID: 'test-client-id',
};
const ISSUER = `https://${ENTRA_ENVIRONMENT.ENTRA_TENANT_ID}.ciamlogin.com/${ENTRA_ENVIRONMENT.ENTRA_TENANT_ID}/v2.0`;
const NOW_MS = Date.UTC(2026, 0, 1, 12);
const NOW_SECONDS = NOW_MS / 1000;
const HOUR_MS = 60 * 60 * 1000;

const signingKeys = () => ({
  getSigningKey: async () => ({ getPublicKey: () => publicKeyPem }),
});
const failingWith = (name, message) => () => ({
  getSigningKey: async () => {
    throw Object.assign(new Error(message), { name });
  },
});
// The kid is absent from the tenant's key set: the token's fault.
const unknownKeyId = failingWith('SigningKeyNotFoundError', 'key not found');
// The key endpoint is unreachable: not the caller's fault.
const unreachableKeys = failingWith('FetchError', 'getaddrinfo ENOTFOUND');
const tenantMetadata = async () => ({ issuer: ISSUER, jwksUri: 'https://example/keys' });

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      sub: 'user-123',
      oid: 'oid-123',
      name: 'Test User',
      email: 'test@example.com',
      aud: ENTRA_ENVIRONMENT.ENTRA_CLIENT_ID,
      iss: ISSUER,
      exp: NOW_SECONDS + 3600,
      ...overrides,
    },
    privateKeyPem,
    { algorithm: 'RS256', header: { kid: 'test-key' } },
  );
}

// v4 requests expose headers through .get().
const bearer = (token) => ({ headers: new Map([['authorization', `Bearer ${token}`]]) });
const noHeaders = () => ({ headers: new Map() });

const authenticateWith = (request, options = {}) =>
  authenticate(request, {
    jwksClientFactory: signingKeys,
    configLoader: tenantMetadata,
    environment: ENTRA_ENVIRONMENT,
    now: () => NOW_MS,
    ...options,
  });

describe('authenticate — success', () => {
  test('valid token resolves userId/userOid/userEmail/userName', async () => {
    expect(await authenticateWith(bearer(makeToken()))).toEqual({
      userId: 'user-123',
      userOid: 'oid-123',
      userEmail: 'test@example.com',
      userName: 'Test User',
    });
  });

  test('userOid is null when the oid claim is absent', async () => {
    const user = await authenticateWith(bearer(makeToken({ oid: undefined })));
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
    const user = await authenticateWith(bearer(makeToken(claims)));
    expect(user[field]).toBe(expected);
  });

  test('checks expiry against the injected clock', async () => {
    const token = makeToken({ exp: NOW_SECONDS + 60 });

    expect(await authenticateWith(bearer(token))).not.toBeNull();
    expect(await authenticateWith(bearer(token), { now: () => NOW_MS + 61_000 })).toBeNull();
  });
});

describe('authenticate — rejection (null)', () => {
  const symmetricToken = jwt.sign(
    {
      sub: 'user-123',
      aud: ENTRA_ENVIRONMENT.ENTRA_CLIENT_ID,
      iss: ISSUER,
      exp: NOW_SECONDS + 3600,
    },
    crypto.randomBytes(32).toString('hex'),
    { algorithm: 'HS256', header: { kid: 'test-key' } },
  );

  test.each([
    ['missing Authorization header', noHeaders()],
    ['non-Bearer scheme', { headers: new Map([['authorization', 'Basic sometoken']]) }],
    ['malformed token', bearer('notajwt')],
    ['expired token', bearer(makeToken({ exp: NOW_SECONDS - 60 }))],
    ['token not valid yet', bearer(makeToken({ nbf: NOW_SECONDS + 60 }))],
    ['wrong audience', bearer(makeToken({ aud: 'wrong-client' }))],
    ['wrong issuer', bearer(makeToken({ iss: 'https://attacker.example.com/' }))],
    ['disallowed algorithm (HS256)', bearer(symmetricToken)],
    ['unknown signing key (kid not in JWKS)', bearer(makeToken()), unknownKeyId],
  ])('returns null for %s', async (_label, request, jwksClientFactory = signingKeys) => {
    expect(await authenticateWith(request, { jwksClientFactory })).toBeNull();
  });
});

// A null here would answer 401 and sign every user out for the length of an outage.
describe('authenticate — infrastructure failures propagate', () => {
  test('rethrows when the JWKS endpoint is unreachable', async () => {
    await expect(
      authenticateWith(bearer(makeToken()), { jwksClientFactory: unreachableKeys }),
    ).rejects.toThrow('getaddrinfo ENOTFOUND');
  });

  test('rethrows when the OIDC metadata document cannot be loaded', async () => {
    const configLoader = async () => {
      throw new Error('OIDC metadata fetch failed: 503');
    };
    await expect(authenticateWith(bearer(makeToken()), { configLoader })).rejects.toThrow(
      'OIDC metadata fetch failed: 503',
    );
  });

  test('a malformed token is still rejected, not thrown, before any network call', async () => {
    const configLoader = vi.fn();
    expect(await authenticateWith(bearer('notajwt'), { configLoader })).toBeNull();
    expect(configLoader).not.toHaveBeenCalled();
  });

  test('loads the metadata with the environment and clock it was given', async () => {
    const configLoader = vi.fn(tenantMetadata);
    const now = () => NOW_MS;
    await authenticateWith(bearer(makeToken()), { configLoader, now });
    expect(configLoader).toHaveBeenCalledWith({ environment: ENTRA_ENVIRONMENT, now });
  });
});

describe('authenticate — diagnostic logging', () => {
  test('logs a warning naming the rejection reason for a malformed token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await authenticateWith(bearer('notajwt'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected malformed bearer token'));
    } finally {
      warn.mockRestore();
    }
  });

  test('logs a warning naming the error for a rejected (but verifiable) token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await authenticateWith(bearer(makeToken({ exp: NOW_SECONDS - 60 })));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('TokenExpiredError'));
    } finally {
      warn.mockRestore();
    }
  });

  test('logs an error naming the failure when verification cannot be performed', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        authenticateWith(bearer(makeToken()), { jwksClientFactory: unreachableKeys }),
      ).rejects.toThrow();
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('getaddrinfo ENOTFOUND'));
    } finally {
      logError.mockRestore();
    }
  });
});

describe('authenticate — SKIP_AUTH dev bypass', () => {
  test('returns a hardcoded dev user without a token', async () => {
    const user = await authenticateWith(noHeaders(), { environment: { SKIP_AUTH: 'true' } });
    expect(user).toEqual({
      userId: 'local-dev-user',
      userEmail: 'dev@localhost',
      userName: 'Local Dev',
    });
  });

  test('stays off for any other SKIP_AUTH value', async () => {
    const environment = { ...ENTRA_ENVIRONMENT, SKIP_AUTH: 'yes' };
    expect(await authenticateWith(noHeaders(), { environment })).toBeNull();
  });

  // Both at once would serve every anonymous caller as one shared user.
  test('refuses the bypass when a client id is configured', async () => {
    const environment = { SKIP_AUTH: 'true', ENTRA_CLIENT_ID: 'test-client-id' };
    await expect(authenticateWith(noHeaders(), { environment })).rejects.toThrow(
      'SKIP_AUTH must not be set when Entra auth is configured',
    );
  });

  test('refuses the bypass when a tenant id is configured', async () => {
    const environment = { SKIP_AUTH: 'true', ENTRA_TENANT_ID: ENTRA_ENVIRONMENT.ENTRA_TENANT_ID };
    await expect(authenticateWith(noHeaders(), { environment })).rejects.toThrow(
      'SKIP_AUTH must not be set when Entra auth is configured',
    );
  });

  // Tofu writes the Entra app settings empty until the tenant exists.
  test('honours the bypass when the Entra settings are present but empty', async () => {
    const environment = { SKIP_AUTH: 'true', ENTRA_CLIENT_ID: '', ENTRA_TENANT_ID: '' };
    const user = await authenticateWith(noHeaders(), { environment });
    expect(user.userId).toBe('local-dev-user');
  });
});

describe('openIdConfigUrl', () => {
  test('builds the ciamlogin metadata URL from the tenant settings', () => {
    expect(openIdConfigUrl(ENTRA_ENVIRONMENT)).toBe(
      'https://bikebuddy.ciamlogin.com/aaaabbbb-0000-cccc-1111-dddd2222eeee/v2.0/.well-known/openid-configuration',
    );
  });
});

describe('getOpenIdConfig', () => {
  const metadata = {
    issuer: 'https://tenant.ciamlogin.com/v2.0',
    jwks_uri: 'https://tenant.ciamlogin.com/keys',
  };
  const fetchingMetadata = () =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => metadata });
  // The cache is module-wide, so each test starts its clock far past the last one's.
  let clockStart = NOW_MS;
  const freshClock = () => {
    clockStart += 1000 * HOUR_MS;
    let time = clockStart;
    return { now: () => time, advance: (milliseconds) => (time += milliseconds) };
  };

  test('throws when the metadata endpoint returns a non-ok status', async () => {
    const fetchMetadata = async () => ({ ok: false, status: 503 });
    await expect(
      getOpenIdConfig({ fetchMetadata, now: freshClock().now, environment: ENTRA_ENVIRONMENT }),
    ).rejects.toThrow('OIDC metadata fetch failed: 503');
  });

  test('fetches the tenant metadata and caches the result', async () => {
    const fetchMetadata = fetchingMetadata();
    const options = { fetchMetadata, now: freshClock().now, environment: ENTRA_ENVIRONMENT };

    const first = await getOpenIdConfig(options);
    const second = await getOpenIdConfig(options);

    expect(first).toEqual({ issuer: metadata.issuer, jwksUri: metadata.jwks_uri });
    expect(second).toBe(first);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);
    expect(fetchMetadata).toHaveBeenCalledWith(openIdConfigUrl(ENTRA_ENVIRONMENT));
  });

  test('re-fetches once the one-hour cache has expired, not before', async () => {
    const fetchMetadata = fetchingMetadata();
    const clock = freshClock();
    const options = { fetchMetadata, now: clock.now, environment: ENTRA_ENVIRONMENT };

    await getOpenIdConfig(options);
    clock.advance(HOUR_MS - 1);
    await getOpenIdConfig(options);
    expect(fetchMetadata).toHaveBeenCalledTimes(1);

    clock.advance(1);
    await getOpenIdConfig(options);
    expect(fetchMetadata).toHaveBeenCalledTimes(2);
  });
});

describe('defaultJwksClient', () => {
  // A module-wide singleton, so this is the only test that sees it built.
  test('builds one jwks-rsa client with caching and rate limiting, then reuses it', () => {
    const first = defaultJwksClient('https://example.com/keys');
    const second = defaultJwksClient('https://example.com/other-keys');
    expect(typeof first.getSigningKey).toBe('function');
    expect(second).toBe(first);
    expect(first.options).toMatchObject({
      jwksUri: 'https://example.com/keys',
      cache: true,
      rateLimit: true,
    });
  });
});
