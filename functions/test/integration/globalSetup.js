'use strict';

const { spawn } = require('node:child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { resolve } = require('node:path');
const { assertEmulatorTargets } = require('./emulatorGuard');
const { startOidcProvider } = require('./oidcProvider');

// Its own port: a dev host on :7071 (often SKIP_AUTH) is never reused or disturbed.
const HOST_PORT = 7072;
const API_BASE_URL = `http://localhost:${HOST_PORT}/api`;
const HEALTH_URL = `${API_BASE_URL}/health`;
const HOST_START_TIMEOUT_MS = 150_000;
const functionsDirectory = resolve(__dirname, '..', '..');

// Fixed test values: the tenant only names the (unused) Entra URL; the audience is what tokens carry.
const TEST_ENTRA_SETTINGS = {
  ENTRA_TENANT_SUBDOMAIN: 'integration-test',
  ENTRA_TENANT_ID: '00000000-0000-4000-8000-000000000067',
  ENTRA_CLIENT_ID: 'integration-test-client',
};

async function isUp() {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch (error) {
    // Nothing listening yet: fetch rejects with a TypeError whose cause is the socket error.
    if (error instanceof TypeError) return false;
    throw error;
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp()) return true;
    await sleep(2000);
  }
  return false;
}

function stopProcessGroup(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

/**
 * Core Tools lets a non-empty environment variable win over local.settings.json, so each of these
 * replaces whatever the developer's settings say, SKIP_AUTH included.
 */
function hostEnvironment({ metadataUrl, cosmosConnectionString, blobConnectionString }) {
  return {
    ...process.env,
    ...TEST_ENTRA_SETTINGS,
    ENTRA_OIDC_METADATA_URL: metadataUrl,
    SKIP_AUTH: 'false',
    COSMOS_CONNECTION_STRING: cosmosConnectionString,
    BLOB_CONNECTION_STRING: blobConnectionString,
  };
}

async function startHost(environment) {
  const child = spawn('func', ['start', '--port', String(HOST_PORT)], {
    cwd: functionsDirectory,
    env: environment,
    stdio: 'inherit',
    detached: true,
  });
  if (!(await waitForHealth(HOST_START_TIMEOUT_MS))) {
    stopProcessGroup(child);
    throw new Error(
      `Functions host did not become healthy on :${HOST_PORT} within ${HOST_START_TIMEOUT_MS} ms`,
    );
  }
  return child;
}

// Starts a local OIDC issuer and an authenticated Functions host; Cosmos and Azurite must run.
module.exports = async function setup(project) {
  const { cosmosConnectionString, blobConnectionString } = assertEmulatorTargets();
  if (await isUp()) {
    throw new Error(`Port ${HOST_PORT} already serves a host this run did not configure; stop it`);
  }

  const issuer = await startOidcProvider({ audience: TEST_ENTRA_SETTINGS.ENTRA_CLIENT_ID });
  let host;
  try {
    host = await startHost(
      hostEnvironment({
        metadataUrl: issuer.metadataUrl,
        cosmosConnectionString,
        blobConnectionString,
      }),
    );
  } catch (error) {
    await issuer.close();
    throw error;
  }

  project.provide('integration', { apiBaseUrl: API_BASE_URL, signing: issuer.signing });
  return async () => {
    stopProcessGroup(host);
    await issuer.close();
  };
};
