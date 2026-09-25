'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const verifyJwt = promisify(jwt.verify);
const BEARER_PREFIX = 'Bearer ';
const DEV_USER = { userId: 'local-dev-user', userEmail: 'dev@localhost', userName: 'Local Dev' };

// ENTRA_TENANT_SUBDOMAIN is the leading host label ("bikebuddy"), ENTRA_TENANT_ID the directory GUID.
function openIdConfigUrl(environment) {
  const subdomain = environment.ENTRA_TENANT_SUBDOMAIN;
  const tenantId = environment.ENTRA_TENANT_ID;
  return `https://${subdomain}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

// Issuer and jwks_uri come from the metadata because the issuer host differs
// across Entra surfaces; a warm instance can outlive a change to either.
const CONFIG_TTL_MS = 60 * 60 * 1000;

let cachedConfig;
let cachedConfigAt = 0;
async function getOpenIdConfig({
  fetchMetadata = fetch,
  now = Date.now,
  environment = process.env,
} = {}) {
  if (cachedConfig && now() - cachedConfigAt < CONFIG_TTL_MS) return cachedConfig;
  const response = await fetchMetadata(openIdConfigUrl(environment));
  if (!response.ok) throw new Error(`OIDC metadata fetch failed: ${response.status}`);
  const metadata = await response.json();
  cachedConfig = { issuer: metadata.issuer, jwksUri: metadata.jwks_uri };
  cachedConfigAt = now();
  return cachedConfig;
}

let cachedJwksClient;
function defaultJwksClient(jwksUri) {
  cachedJwksClient ??= jwksRsa({ jwksUri, cache: true, rateLimit: true });
  return cachedJwksClient;
}

// External ID sends `email` or `preferred_username`; `emails` is B2C's shape.
const resolveEmail = (payload) =>
  payload.email || payload.preferred_username || payload.emails?.[0] || null;
const resolveName = (payload) => payload.name || payload.given_name || null;

// A configured tenant means a deployed environment: the bypass throws there
// instead of falling through to real auth and leaving the setting unnoticed.
function isDevBypassActive(environment) {
  if (environment.SKIP_AUTH !== 'true') return false;
  if (environment.ENTRA_CLIENT_ID || environment.ENTRA_TENANT_ID) {
    throw new Error('SKIP_AUTH must not be set when Entra auth is configured');
  }
  return true;
}

// Only these become a 401: an Entra or network outage must not tell every
// signed-in user they are signed out. A `kid` absent from the key set is the
// token's fault, unlike a failed key fetch.
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
 * The caller for a valid token, null for a missing or rejected one; throws when
 * verification could not run, so the caller answers a retryable 5xx, not a 401.
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

module.exports = { authenticate, openIdConfigUrl, getOpenIdConfig, defaultJwksClient };
