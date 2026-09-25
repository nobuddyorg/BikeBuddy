import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The full-stack suite reads and deletes whatever these settings name: only emulators pass.

const LOCAL_SETTINGS_PATH = fileURLToPath(
  new URL('../functions/local.settings.json', import.meta.url),
);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const AZURITE_ACCOUNT = 'devstoreaccount1';
const DEFAULT_DATABASE = 'bikebuddy';

export interface EmulatorSettings {
  cosmosConnectionString: string;
  cosmosDatabase: string;
  blobConnectionString: string;
}

function connectionStringParts(connectionString: string): Record<string, string> {
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

const isLocalUrl = (value: string | undefined) =>
  value !== undefined && URL.canParse(value) && LOCAL_HOSTS.has(new URL(value).hostname);

const isEmulatorCosmos = (connectionString: string) =>
  isLocalUrl(connectionStringParts(connectionString).AccountEndpoint);

function isEmulatorBlob(connectionString: string) {
  const parts = connectionStringParts(connectionString);
  if (parts.UseDevelopmentStorage === 'true') return true;
  return isLocalUrl(parts.BlobEndpoint) && parts.AccountName === AZURITE_ACCOUNT;
}

// The Functions host falls back to local.settings.json's Values, so the guard does too.
function readLocalSettings(): Record<string, string> {
  try {
    const settings = JSON.parse(readFileSync(LOCAL_SETTINGS_PATH, 'utf8')) as {
      Values?: Record<string, string>;
    };
    return settings.Values ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {};
  }
}

/** Throws unless Cosmos and Blob Storage are local emulators; returns their settings. */
export function assertEmulatorSettings(): EmulatorSettings {
  const localSettings = readLocalSettings();
  const valueOf = (name: string) => process.env[name] || localSettings[name] || '';
  const settings = {
    cosmosConnectionString: valueOf('COSMOS_CONNECTION_STRING'),
    cosmosDatabase: valueOf('COSMOS_DATABASE') || DEFAULT_DATABASE,
    blobConnectionString: valueOf('BLOB_CONNECTION_STRING'),
  };
  const refusals = [
    ...(isEmulatorCosmos(settings.cosmosConnectionString)
      ? []
      : ['COSMOS_CONNECTION_STRING does not point at a Cosmos emulator on this machine']),
    ...(isEmulatorBlob(settings.blobConnectionString)
      ? []
      : ['BLOB_CONNECTION_STRING is neither UseDevelopmentStorage=true nor a local Azurite']),
  ];
  if (refusals.length > 0) {
    throw new Error(`Refusing to run against real storage: ${refusals.join('; ')}`);
  }
  return settings;
}
