'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const verifyJwt = promisify(jwt.verify);
const BEARER_PREFIX = 'Bearer ';

// Microsoft Entra External ID OIDC metadata document for the configured tenant.
// ENTRA_TENANT_SUBDOMAIN is the leading name (e.g. "bikebuddy"); ENTRA_TENANT_ID
// is the directory GUID.
function openIdConfigUrl() {
  const subdomain = process.env.ENTRA_TENANT_SUBDOMAIN;
  const tenantId = process.env.ENTRA_TENANT_ID;
  return `https://${subdomain}.ciamlogin.com/${tenantId}/v2.0/.well-known/openid-configuration`;
}

// Read issuer + jwks_uri from the metadata rather than constructing them: the
// issuer host differs across Entra surfaces, so the document is the source of
// truth. Cached on warm instances; configLoader stays injectable for tests.
// Re-read periodically rather than caching for the life of the instance: an
// issuer or jwks_uri change would otherwise not be picked up until the instance
// recycled, which on a warm function can be a long time.
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

// External ID delivers the address as `email` or `preferred_username`; tolerate
// the B2C-style `emails` array too. Normalise to one value or null.
const resolveEmail = (payload) =>
  payload.email || payload.preferred_username || payload.emails?.[0] || null;
const resolveName = (payload) => payload.name || payload.given_name || null;

// Dev-only bypass: set SKIP_AUTH=true to skip JWT verification and use a
// hardcoded local user. Never set this in production once auth is configured.
function skipAuthIfDev() {
  if (process.env.SKIP_AUTH !== 'true') return null;
  return { userId: 'local-dev-user', userEmail: 'dev@localhost', userName: 'Local Dev' };
}

// Distinguishes "this caller's token is bad" from "BikeBuddy cannot verify
// anything right now". Only the former is the caller's fault and may become a
// 401; the latter must not be, because answering 401 during an Entra or network
// outage tells every correctly-authenticated user they are signed out.
//
// SigningKeyNotFoundError counts as a client error: it means the token's `kid`
// is genuinely absent from the tenant's JWKS, not that the fetch failed.
const CLIENT_TOKEN_ERRORS = new Set([
  'JsonWebTokenError', // malformed, bad signature, wrong audience/issuer, bad alg
  'TokenExpiredError',
  'NotBeforeError',
  'SigningKeyNotFoundError',
]);

// Resolves the caller from the request's Bearer token: returns
// { userId, userEmail, userName } for a valid token, null when the token is
// missing or rejected, and throws when verification could not be performed at
// all (metadata or JWKS unreachable) so callers surface a retryable 5xx rather
// than a misleading 401.
// jwksClientFactory and configLoader are injectable for testing.
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
