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
let cachedConfig;
async function getOpenIdConfig(fetchImpl = fetch) {
  if (!cachedConfig) {
    const res = await fetchImpl(openIdConfigUrl());
    if (!res.ok) throw new Error(`OIDC metadata fetch failed: ${res.status}`);
    const doc = await res.json();
    cachedConfig = { issuer: doc.issuer, jwksUri: doc.jwks_uri };
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

// Resolves the caller from the request's Bearer token: returns
// { userId, userEmail, userName } on success or null on any auth failure.
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

  try {
    const token = authHeader.slice(BEARER_PREFIX.length);
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) throw new Error('Malformed token');

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
      userEmail: resolveEmail(payload),
      userName: resolveName(payload),
    };
  } catch {
    return null;
  }
}

module.exports = { authenticate, openIdConfigUrl, getOpenIdConfig, defaultJwksClient };
