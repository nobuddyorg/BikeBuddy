'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const { openIdConfigUrl } = require('../lib/oidcMetadataUrl');
const { createSigningKeyCache } = require('../lib/signingKeyCache');

const verifyJwt = promisify(jwt.verify);
const BEARER_PREFIX = 'Bearer ';
const DEV_USER = { userId: 'local-dev-user', userEmail: 'dev@localhost', userName: 'Local Dev' };

// Read from the metadata (the issuer host varies by Entra surface), refreshed on warm instances.
const CONFIG_TTL_MS = 60 * 60 * 1000;
// A failed refresh keeps serving the last document this long, so an Entra blip is no outage.
const CONFIG_MAX_STALENESS_MS = 24 * 60 * 60 * 1000;
// Both outbound calls: a hung Entra endpoint must not hold every request open.
const FETCH_TIMEOUT_MS = 5000;

async function fetchOpenIdConfig(fetchMetadata, environment) {
  const response = await fetchMetadata(openIdConfigUrl(environment), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OIDC metadata fetch failed: ${response.status}`);
  const metadata = await response.json();
  return { issuer: metadata.issuer, jwksUri: metadata.jwks_uri };
}

let cachedConfig;
let cachedConfigAt = 0;
let pendingConfig;
async function getOpenIdConfig({
  fetchMetadata = fetch,
  now = Date.now,
  environment = process.env,
} = {}) {
  const age = now() - cachedConfigAt;
  if (cachedConfig && age < CONFIG_TTL_MS) return cachedConfig;
  // Concurrent callers share one fetch.
  pendingConfig ??= fetchOpenIdConfig(fetchMetadata, environment).finally(() => {
    pendingConfig = undefined;
  });
  try {
    cachedConfig = await pendingConfig;
    cachedConfigAt = now();
  } catch (error) {
    if (!cachedConfig || age >= CONFIG_MAX_STALENESS_MS) throw error;
    console.error(`auth: OIDC metadata refresh failed, serving the cached copy (${error.message})`);
  }
  return cachedConfig;
}

const defaultSigningKeys = createSigningKeyCache({
  fetchSigningKeys: (jwksUri) => jwksRsa({ jwksUri, timeout: FETCH_TIMEOUT_MS }).getSigningKeys(),
  now: () => Date.now(),
});
function defaultJwksClient(jwksUri) {
  return { getSigningKey: (kid) => defaultSigningKeys.getSigningKey({ jwksUri, kid }) };
}

// External ID sends `email` or `preferred_username`; `emails` is B2C's shape.
const resolveEmail = (payload) =>
  payload.email || payload.preferred_username || payload.emails?.[0] || null;
const resolveName = (payload) => payload.name || payload.given_name || null;

// A configured tenant means deployed: the bypass throws there instead of silently falling back.
function isDevBypassActive(environment) {
  if (environment.SKIP_AUTH !== 'true') return false;
  if (environment.ENTRA_CLIENT_ID || environment.ENTRA_TENANT_ID) {
    throw new Error('SKIP_AUTH must not be set when Entra auth is configured');
  }
  return true;
}

// Only these become a 401, never an outage; an unknown kid is the token's fault, not the fetch's.
const CLIENT_TOKEN_ERRORS = new Set([
  'JsonWebTokenError', // malformed, bad signature, wrong audience/issuer, bad alg
  'TokenExpiredError',
  'NotBeforeError',
  'SigningKeyNotFoundError',
]);

async function verifyToken(token, { kid, jwksClientFactory, configLoader, environment, now }) {
  const { issuer, jwksUri } = await configLoader({ environment, now });
  const key = await jwksClientFactory(jwksUri).getSigningKey(kid);
  const payload = await verifyJwt(token, key.getPublicKey(), {
    audience: environment.ENTRA_CLIENT_ID,
    issuer,
    algorithms: ['RS256'],
    clockTimestamp: Math.floor(now() / 1000),
  });
  return {
    userId: payload.sub,
    // The directory object id: the out-of-band deletion job deletes by it.
    userOid: payload.oid ?? null,
    userEmail: resolveEmail(payload),
    userName: resolveName(payload),
  };
}

/**
 * The caller, or null for a missing or rejected token; throws when verification cannot run (a 5xx).
 */
async function authenticate(
  request,
  {
    jwksClientFactory = defaultJwksClient,
    configLoader = getOpenIdConfig,
    environment = process.env,
    now = Date.now,
  } = {},
) {
  if (isDevBypassActive(environment)) return { ...DEV_USER };

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith(BEARER_PREFIX)) return null;

  const token = authorization.slice(BEARER_PREFIX.length);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    console.warn('auth: rejected malformed bearer token');
    return null;
  }

  try {
    return await verifyToken(token, {
      kid: decoded.header.kid,
      jwksClientFactory,
      configLoader,
      environment,
      now,
    });
  } catch (error) {
    // Name and message only, never the token or its payload.
    if (!CLIENT_TOKEN_ERRORS.has(error.name)) {
      console.error(`auth: unable to verify token (${error.name}: ${error.message})`);
      throw error;
    }
    console.warn(`auth: rejected token (${error.name}: ${error.message})`);
    return null;
  }
}

module.exports = { authenticate, getOpenIdConfig };
