'use strict';

// A local stand-in for the Entra tenant: an OIDC discovery document and the key set it names.

const { createServer } = require('node:http');
const { generateKeyPairSync, randomUUID } = require('node:crypto');

const LOOPBACK = '127.0.0.1';
const TENANT_PATH = '/integration-tenant/v2.0';
const METADATA_PATH = `${TENANT_PATH}/.well-known/openid-configuration`;
const KEYS_PATH = `${TENANT_PATH}/discovery/keys`;

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

function serveJson(documents) {
  return (request, response) => {
    const document = request.method === 'GET' ? documents.get(request.url) : undefined;
    if (!document) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(document));
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, () => resolve(server.address().port));
  });
}

// Keep-alive sockets from the host or a test would otherwise hold close() open.
function close(server) {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/**
 * Starts the issuer on a free loopback port. `metadataUrl` is what ENTRA_OIDC_METADATA_URL names;
 * `signing` is plain data, safe to hand to test workers.
 *
 * @param {{ audience: string }} options
 */
async function startOidcProvider({ audience }) {
  const issuerKey = rsaKeyPair();
  const foreignKey = rsaKeyPair();
  const keyId = `integration-${randomUUID()}`;
  const documents = new Map();
  const server = createServer(serveJson(documents));
  const origin = `http://${LOOPBACK}:${await listen(server)}`;
  const issuer = `${origin}${TENANT_PATH}`;

  documents.set(METADATA_PATH, { issuer, jwks_uri: `${origin}${KEYS_PATH}` });
  documents.set(KEYS_PATH, {
    keys: [{ ...issuerKey.publicJwk, kid: keyId, use: 'sig', alg: 'RS256' }],
  });

  return {
    metadataUrl: `${origin}${METADATA_PATH}`,
    signing: {
      issuer,
      audience,
      keyId,
      privateKeyPem: issuerKey.privateKeyPem,
      foreignPrivateKeyPem: foreignKey.privateKeyPem,
    },
    close: () => close(server),
  };
}

module.exports = { startOidcProvider };
