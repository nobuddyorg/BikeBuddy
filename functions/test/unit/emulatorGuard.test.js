'use strict';

const { resolve } = require('node:path');
const {
  connectionStringParts,
  isEmulatorCosmos,
  isEmulatorBlob,
  emulatorSettings,
  readLocalSettings,
  assertEmulatorTargets,
} = require('../integration/emulatorGuard');

const LOCAL_COSMOS = 'AccountEndpoint=http://localhost:8081/;AccountKey=emulator-key';
const LOCAL_BLOB = 'UseDevelopmentStorage=true';
const REMOTE_COSMOS = 'AccountEndpoint=https://bikebuddy.documents.azure.com:443/;AccountKey=k';
const REMOTE_BLOB =
  'DefaultEndpointsProtocol=https;AccountName=bikebuddy;AccountKey=k;EndpointSuffix=core.windows.net';

describe('connectionStringParts', () => {
  it('splits on the first equals sign of each part, so keys may contain more', () => {
    expect(connectionStringParts('AccountEndpoint=http://h/;AccountKey=abc==;')).toEqual({
      AccountEndpoint: 'http://h/',
      AccountKey: 'abc==',
    });
  });

  it('ignores parts without a value and surrounding whitespace', () => {
    expect(connectionStringParts(' A = 1 ;;junk; B=2')).toEqual({ A: '1', B: '2' });
  });
});

describe('isEmulatorCosmos', () => {
  it.each([
    'AccountEndpoint=http://localhost:8081/;AccountKey=k',
    'AccountEndpoint=https://127.0.0.1:8081/;AccountKey=k',
    'AccountEndpoint=http://[::1]:8081/;AccountKey=k',
  ])('accepts the local emulator at %s', (connectionString) => {
    expect(isEmulatorCosmos(connectionString)).toBe(true);
  });

  it.each([
    REMOTE_COSMOS,
    'AccountEndpoint=http://localhost.attacker.example/;AccountKey=k',
    'AccountEndpoint=not a url;AccountKey=k',
    'AccountKey=k',
    '',
  ])('refuses %j', (connectionString) => {
    expect(isEmulatorCosmos(connectionString)).toBe(false);
  });
});

describe('isEmulatorBlob', () => {
  it.each([
    LOCAL_BLOB,
    'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=k;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;',
  ])('accepts Azurite at %s', (connectionString) => {
    expect(isEmulatorBlob(connectionString)).toBe(true);
  });

  it.each([
    REMOTE_BLOB,
    'UseDevelopmentStorage=false',
    'AccountName=devstoreaccount1;BlobEndpoint=https://bikebuddy.blob.core.windows.net/',
    'AccountName=bikebuddy;BlobEndpoint=http://127.0.0.1:10000/bikebuddy',
    '',
  ])('refuses %j', (connectionString) => {
    expect(isEmulatorBlob(connectionString)).toBe(false);
  });
});

describe('emulatorSettings', () => {
  it('prefers the environment over local.settings.json', () => {
    const settings = emulatorSettings({
      environment: { COSMOS_CONNECTION_STRING: REMOTE_COSMOS },
      localSettings: { COSMOS_CONNECTION_STRING: LOCAL_COSMOS, BLOB_CONNECTION_STRING: LOCAL_BLOB },
    });

    expect(settings.cosmosConnectionString).toBe(REMOTE_COSMOS);
    expect(settings.blobConnectionString).toBe(LOCAL_BLOB);
    expect(settings.refusals).toEqual([
      'COSMOS_CONNECTION_STRING does not point at a Cosmos emulator on this machine',
    ]);
  });

  it('refuses both stores when neither source names them', () => {
    expect(emulatorSettings({ environment: {}, localSettings: {} })).toEqual({
      cosmosConnectionString: '',
      blobConnectionString: '',
      refusals: [expect.any(String), expect.any(String)],
    });
  });

  it('refuses a real storage account', () => {
    const settings = emulatorSettings({
      environment: { COSMOS_CONNECTION_STRING: LOCAL_COSMOS, BLOB_CONNECTION_STRING: REMOTE_BLOB },
      localSettings: {},
    });

    expect(settings.refusals).toEqual([
      'BLOB_CONNECTION_STRING is neither UseDevelopmentStorage=true nor a local Azurite',
    ]);
  });
});

describe('readLocalSettings', () => {
  it('reads the Values of a local.settings.json file', () => {
    const example = resolve(__dirname, '..', '..', 'local.settings.json.example');
    expect(readLocalSettings(example)).toMatchObject({ BLOB_CONNECTION_STRING: LOCAL_BLOB });
  });

  it('treats a settings file without Values as no settings', () => {
    expect(readLocalSettings(resolve(__dirname, '..', '..', 'package.json'))).toEqual({});
  });

  it('treats a missing file as no settings', () => {
    expect(readLocalSettings(resolve(__dirname, 'no-such-file.json'))).toEqual({});
  });

  it('fails on a file it cannot read as settings', () => {
    expect(() => readLocalSettings(__dirname)).toThrow(/EISDIR/);
  });
});

describe('assertEmulatorTargets', () => {
  it('returns the connection strings when both stores are emulators', () => {
    const environment = {
      COSMOS_CONNECTION_STRING: LOCAL_COSMOS,
      BLOB_CONNECTION_STRING: LOCAL_BLOB,
    };

    expect(assertEmulatorTargets({ environment, localSettings: {} })).toMatchObject({
      cosmosConnectionString: LOCAL_COSMOS,
      blobConnectionString: LOCAL_BLOB,
    });
  });

  it('throws, naming every refused store, when one is not', () => {
    const environment = {
      COSMOS_CONNECTION_STRING: REMOTE_COSMOS,
      BLOB_CONNECTION_STRING: REMOTE_BLOB,
    };

    expect(() => assertEmulatorTargets({ environment, localSettings: {} })).toThrow(
      /^Refusing to run against real storage: COSMOS_CONNECTION_STRING .+; BLOB_CONNECTION_STRING /,
    );
  });

  it('reads the process environment by default', () => {
    vi.stubEnv('COSMOS_CONNECTION_STRING', LOCAL_COSMOS);
    vi.stubEnv('BLOB_CONNECTION_STRING', REMOTE_BLOB);
    try {
      expect(() => assertEmulatorTargets()).toThrow(/BLOB_CONNECTION_STRING/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
