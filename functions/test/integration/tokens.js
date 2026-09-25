'use strict';

// Access tokens the harness's local issuer vouches for, and every way the middleware must refuse one.

const { createHmac, createPublicKey } = require('node:crypto');
const jwt = require('jsonwebtoken');

const LIFETIME_SECONDS = 60 * 60;
const SKEW_SECONDS = 5 * 60;

const base64Url = (value) => Buffer.from(value).toString('base64url');

function unsignedToken({ header, payload }) {
  return `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}.`;
}

// HMAC keyed with the issuer's public key: the classic RS256-to-HS256 confusion.
function publicKeyHmacToken({ header, payload, privateKeyPem }) {
  const publicKeyPem = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' });
  const signingInput = unsignedToken({ header, payload }).slice(0, -1);
  const signature = createHmac('sha256', publicKeyPem).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * @param {{ issuer: string, audience: string, keyId: string, privateKeyPem: string, foreignPrivateKeyPem: string }} signing
 *   what the harness's issuer publishes, plus a key it does not
 * @param {{ now?: () => number }} [clock]
 */
function tokenMinter(signing, { now = Date.now } = {}) {
  const nowSeconds = () => Math.floor(now() / 1000);
  const claimsFor = ({ userId, claims = {} }) => ({
    sub: userId,
    aud: signing.audience,
    iss: signing.issuer,
    iat: nowSeconds(),
    exp: nowSeconds() + LIFETIME_SECONDS,
    ...claims,
  });
  const sign = (payload, { privateKeyPem = signing.privateKeyPem, keyId = signing.keyId } = {}) =>
    jwt.sign(payload, privateKeyPem, { algorithm: 'RS256', keyid: keyId });

  /** A valid access token for this user; `claims` adds or overrides claims (e.g. `oid`, `email`). */
  const tokenFor = ({ userId, claims = {} }) => sign(claimsFor({ userId, claims }));

  /** One token per reason to refuse it, each for this user and otherwise valid. */
  function rejectedTokensFor({ userId }) {
    const valid = claimsFor({ userId });
    const header = { typ: 'JWT', kid: signing.keyId };
    return {
      expired: sign({ ...valid, iat: valid.iat - LIFETIME_SECONDS, exp: valid.iat - SKEW_SECONDS }),
      'not valid yet': sign({ ...valid, nbf: valid.iat + SKEW_SECONDS }),
      'wrong audience': sign({ ...valid, aud: `${signing.audience}-other` }),
      'wrong issuer': sign({ ...valid, iss: 'https://login.example.com/other-tenant/v2.0' }),
      'signed by another key': sign(valid, { privateKeyPem: signing.foreignPrivateKeyPem }),
      'alg none': unsignedToken({ header: { ...header, alg: 'none' }, payload: valid }),
      'HS256 keyed with the public key': publicKeyHmacToken({
        header: { ...header, alg: 'HS256' },
        payload: valid,
        privateKeyPem: signing.privateKeyPem,
      }),
    };
  }

  /** Signed by a key the issuer does not publish; the host refetches its key set at most every 5 minutes for one. */
  const unknownKeyTokenFor = ({ userId }) =>
    sign(claimsFor({ userId }), {
      privateKeyPem: signing.foreignPrivateKeyPem,
      keyId: `${signing.keyId}-unknown`,
    });

  return { tokenFor, rejectedTokensFor, unknownKeyTokenFor };
}

module.exports = { tokenMinter };
