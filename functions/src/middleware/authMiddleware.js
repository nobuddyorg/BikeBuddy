'use strict';

const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

// B2C_TENANT is the full onmicrosoft.com domain, e.g. "mytenant.onmicrosoft.com"
const tenantName = () => process.env.B2C_TENANT.split('.')[0];

function defaultJwksClient() {
  return jwksRsa({
    jwksUri: `https://${tenantName()}.b2clogin.com/${process.env.B2C_TENANT}/discovery/v2.0/keys?p=${process.env.B2C_POLICY}`,
    cache: true,
    rateLimit: true,
  });
}

function getSigningKey(client, header) {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key.getPublicKey());
    });
  });
}

async function verifyToken(token, jwksClientFactory = defaultJwksClient) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error('Malformed token');

  const signingKey = await getSigningKey(jwksClientFactory(), decoded.header);

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      signingKey,
      {
        audience: process.env.B2C_CLIENT_ID,
        issuer: `https://${tenantName()}.b2clogin.com/${process.env.B2C_TENANT}/v2.0/`,
        algorithms: ['RS256'],
      },
      (err, payload) => {
        if (err) return reject(err);
        resolve(payload);
      },
    );
  });
}

// Returns true and attaches context.userId/userEmail, or sets context.res 401 and returns false.
// jwksClientFactory is injectable for testing; defaults to real B2C client.
async function authMiddleware(context, req, jwksClientFactory = defaultJwksClient) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    context.res = { status: 401, body: { error: 'Authorization header missing or malformed' } };
    return false;
  }

  try {
    const payload = await verifyToken(authHeader.slice(7), jwksClientFactory);
    context.userId = payload.sub;
    context.userEmail = (payload.emails && payload.emails[0]) || payload.email || null;
    return true;
  } catch {
    context.res = { status: 401, body: { error: 'Invalid or expired token' } };
    return false;
  }
}

module.exports = { authMiddleware, verifyToken };
