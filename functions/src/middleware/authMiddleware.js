'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const verifyJwt = promisify(jwt.verify);
const BEARER_PREFIX = 'Bearer ';

// B2C_TENANT is the full onmicrosoft.com domain (e.g. "mytenant.onmicrosoft.com");
// the b2clogin host uses only the leading tenant name.
function b2cBaseUrl() {
  const tenant = process.env.B2C_TENANT;
  return `https://${tenant.split('.')[0]}.b2clogin.com/${tenant}`;
}

// Memoised so the configured cache/rateLimit persist across requests on a warm
// instance; lazy so it reads env at call time and stays injectable for tests.
let cachedJwksClient;
function defaultJwksClient() {
  if (!cachedJwksClient) {
    cachedJwksClient = jwksRsa({
      jwksUri: `${b2cBaseUrl()}/discovery/v2.0/keys?p=${process.env.B2C_POLICY}`,
      cache: true,
      rateLimit: true,
    });
  }
  return cachedJwksClient;
}

// B2C delivers the address as an `emails` array (sign-up/sign-in) or a single
// `email` claim; normalise to one value or null.
const resolveEmail = (payload) => payload.emails?.[0] || payload.email || null;
const resolveName = (payload) => payload.name || payload.given_name || null;

// Returns true and sets context.userId/userEmail, or sets context.res 401 and
// returns false. jwksClientFactory is injectable for testing.
async function authMiddleware(context, req, jwksClientFactory = defaultJwksClient) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith(BEARER_PREFIX)) {
    context.res = { status: 401, body: { error: 'Authorization header missing or malformed' } };
    return false;
  }

  try {
    const token = authHeader.slice(BEARER_PREFIX.length);
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) throw new Error('Malformed token');

    const client = jwksClientFactory();
    const key = await client.getSigningKey(decoded.header.kid);
    const payload = await verifyJwt(token, key.getPublicKey(), {
      audience: process.env.B2C_CLIENT_ID,
      issuer: `${b2cBaseUrl()}/v2.0/`,
      algorithms: ['RS256'],
    });

    context.userId = payload.sub;
    context.userEmail = resolveEmail(payload);
    context.userName = resolveName(payload);
    return true;
  } catch {
    context.res = { status: 401, body: { error: 'Invalid or expired token' } };
    return false;
  }
}

module.exports = { authMiddleware, b2cBaseUrl, defaultJwksClient };
