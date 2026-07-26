'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const verifyJwt = promisify(jwt.verify);
const BEARER_PREFIX = 'Bearer ';

// ENTRA_TENANT_SUBDOMAIN is the leading name ("bikebuddy"), ENTRA_TENANT_ID the
// directory GUID.
function openIdConfigUrl() {
  const subdomain = process.env.ENTRA_TENANT_SUBDOMAIN;
  const tenantId = process.env.ENTRA_TENANT_ID;
  return `https://${subdomain}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

// issuer and jwks_uri are read from the metadata, not constructed: the issuer
// host differs across Entra surfaces. The TTL is there because a warm instance
// can live long enough to miss a change to either.
const CONFIG_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedConfig;
let cachedConfigAt = 0;
async function getOpenIdConfig(fetchImpl = fetch) {
  if (!cachedConfig || Date.now() - cachedConfigAt >= CONFIG_TTL_MS) {
    const res = await fetchImpl(openIdConfigUrl());
    if (!res.ok) throw new Error(`OIDC metadata fetch failed: ${res.status}`);
    const doc = await res.json();
    cachedConfig = { issuer: doc.issuer, jwksUri: doc.jwks_uri };
    cachedConfigAt = Date.now();
  }
  return cachedConfig;
}

let cachedJwksClient;
function defaultJwksClient(jwksUri) {
  if (!cachedJwksClient) {
    cachedJwksClient = jwksRsa({ jwksUri, cache: true, rateLimit: true });
  }
  return cachedJwksClient;
}

// External ID sends `email` or `preferred_username`; `emails` is B2C's shape.
const resolveEmail = (payload) =>
  payload.email || payload.preferred_username || payload.emails?.[0] || null;
const resolveName = (payload) => payload.name || payload.given_name || null;

// A configured Entra tenant means this is not a dev environment, so the bypass
// is refused there — by throwing rather than falling through to real auth,
// which would leave the misconfiguration in place and unnoticed (#361).
function skipAuthIfDev() {
  if (process.env.SKIP_AUTH !== 'true') return null;
  if (process.env.ENTRA_CLIENT_ID || process.env.ENTRA_TENANT_ID) {
    throw new Error('SKIP_AUTH must not be set when Entra auth is configured');
  }
  return { userId: 'local-dev-user', userEmail: 'dev@localhost', userName: 'Local Dev' };
}

// Only these may become a 401. Answering 401 for an Entra or network outage
// would tell every correctly-authenticated user they are signed out.
// SigningKeyNotFoundError belongs here: the token's `kid` is genuinely absent
// from the tenant's JWKS, which is not the same as the fetch failing.
const CLIENT_TOKEN_ERRORS = new Set([
  'JsonWebTokenError', // malformed, bad signature, wrong audience/issuer, bad alg
  'TokenExpiredError',
  'NotBeforeError',
  'SigningKeyNotFoundError',
]);

// Returns the caller for a valid token, null when it is missing or rejected,
// and throws when verification could not be performed at all so callers surface
// a retryable 5xx rather than a misleading 401.
async function authenticate(
  request,
  jwksClientFactory = defaultJwksClient,
  configLoader = getOpenIdConfig,
) {
  const dev = skipAuthIfDev();
  if (dev) return dev;

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith(BEARER_PREFIX)) return null;

  const token = authHeader.slice(BEARER_PREFIX.length);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    console.warn('auth: rejected malformed bearer token');
    return null;
  }

  try {
    const { issuer, jwksUri } = await configLoader();
    const client = jwksClientFactory(jwksUri);
    const key = await client.getSigningKey(decoded.header.kid);
    const payload = await verifyJwt(token, key.getPublicKey(), {
      audience: process.env.ENTRA_CLIENT_ID,
      issuer,
      algorithms: ['RS256'],
    });

    return {
      userId: payload.sub,
      // Directory object id — needed to delete the user via Graph (GDPR).
      userOid: payload.oid ?? null,
      userEmail: resolveEmail(payload),
      userName: resolveName(payload),
    };
  } catch (err) {
    // Name and message only — never the token or the payload.
    if (CLIENT_TOKEN_ERRORS.has(err.name)) {
      console.warn(`auth: rejected token (${err.name}: ${err.message})`);
      return null;
    }
    console.error(`auth: unable to verify token (${err.name}: ${err.message})`);
    throw err;
  }
}

module.exports = { authenticate, openIdConfigUrl, getOpenIdConfig, defaultJwksClient };
