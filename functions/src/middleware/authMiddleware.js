'use strict';

const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const verifyJwt = promisify(jwt.verify);

const BEARER_PREFIX = 'Bearer ';

// B2C_TENANT is the full onmicrosoft.com domain, e.g. "mytenant.onmicrosoft.com";
// the login host uses only the leading tenant name.
function b2cBaseUrl() {
  const tenantName = process.env.B2C_TENANT.split('.')[0];
  return `https://${tenantName}.b2clogin.com/${process.env.B2C_TENANT}`;
}

function defaultJwksClient() {
  return jwksRsa({
    jwksUri: `${b2cBaseUrl()}/discovery/v2.0/keys?p=${process.env.B2C_POLICY}`,
    cache: true,
    rateLimit: true,
  });
}

function getSigningKey(client, kid) {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

async function verifyToken(token, jwksClientFactory = defaultJwksClient) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Malformed token');

  const signingKey = await getSigningKey(jwksClientFactory(), decoded.header.kid);

  return verifyJwt(token, signingKey, {
    audience: process.env.B2C_CLIENT_ID,
    issuer: `${b2cBaseUrl()}/v2.0/`,
    algorithms: ['RS256'],
  });
}

// B2C may deliver the address as an `emails` array (sign-up/sign-in policies) or a
// single `email` claim; normalise to one value or null.
function resolveEmail(payload) {
  return payload.emails?.[0] || payload.email || null;
}

// Returns true and attaches context.userId/userEmail, or sets context.res 401 and
// returns false. jwksClientFactory is injectable for testing; defaults to real B2C client.
async function authMiddleware(context, req, jwksClientFactory = defaultJwksClient) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
    context.res = { status: 401, body: { error: 'Authorization header missing or malformed' } };
    return false;
  }

  try {
    const token = authHeader.slice(BEARER_PREFIX.length);
    const payload = await verifyToken(token, jwksClientFactory);
    context.userId = payload.sub;
    context.userEmail = resolveEmail(payload);
    return true;
  } catch {
    context.res = { status: 401, body: { error: 'Invalid or expired token' } };
    return false;
  }
}

module.exports = { authMiddleware, verifyToken, b2cBaseUrl, defaultJwksClient };
