'use strict';

// The suite writes and cleans up whatever the connection strings name: only emulators pass.

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const LOCAL_SETTINGS_PATH = resolve(__dirname, '..', '..', 'local.settings.json');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const AZURITE_ACCOUNT = 'devstoreaccount1';

function connectionStringParts(connectionString) {
  return Object.fromEntries(
    connectionString
      .split(';')
      .filter((part) => part.includes('='))
      .map((part) => {
        const separator = part.indexOf('=');
        return [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
      }),
  );
}

function isLocalUrl(value) {
  if (!URL.canParse(value)) return false;
  return LOCAL_HOSTS.has(new URL(value).hostname);
}

const isEmulatorCosmos = (connectionString) =>
  isLocalUrl(connectionStringParts(connectionString).AccountEndpoint);

function isEmulatorBlob(connectionString) {
  const parts = connectionStringParts(connectionString);
  if (parts.UseDevelopmentStorage === 'true') return true;
  return isLocalUrl(parts.BlobEndpoint) && parts.AccountName === AZURITE_ACCOUNT;
}

/** The connection strings the Functions host will use, and why they are refused, if they are. */
function emulatorSettings({ environment, localSettings }) {
  const valueOf = (name) => environment[name] || localSettings[name] || '';
  const cosmosConnectionString = valueOf('COSMOS_CONNECTION_STRING');
  const blobConnectionString = valueOf('BLOB_CONNECTION_STRING');
  const refusals = [
    ...(isEmulatorCosmos(cosmosConnectionString)
      ? []
      : ['COSMOS_CONNECTION_STRING does not point at a Cosmos emulator on this machine']),
    ...(isEmulatorBlob(blobConnectionString)
      ? []
      : ['BLOB_CONNECTION_STRING is neither UseDevelopmentStorage=true nor a local Azurite']),
  ];
  return { cosmosConnectionString, blobConnectionString, refusals };
}

function readLocalSettings(path = LOCAL_SETTINGS_PATH) {
  try {
    return JSON.parse(readFileSync(path).toString()).Values ?? {};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return {};
  }
}

/** Throws unless both stores are local emulators; returns their connection strings. */
function assertEmulatorTargets({
  environment = process.env,
  localSettings = readLocalSettings(),
} = {}) {
  const settings = emulatorSettings({ environment, localSettings });
  if (settings.refusals.length > 0) {
    throw new Error(`Refusing to run against real storage: ${settings.refusals.join('; ')}`);
  }
  return settings;
}

module.exports = {
  connectionStringParts,
  isEmulatorCosmos,
  isEmulatorBlob,
  emulatorSettings,
  readLocalSettings,
  assertEmulatorTargets,
};
