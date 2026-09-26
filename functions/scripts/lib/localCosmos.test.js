'use strict';

const { runInitCosmos } = require('./localCosmos');

const EMULATOR = {
  endpoint: 'http://localhost:8081/',
  key: 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b5n5NVmBSuvpToAw==',
};

function transient(message, code) {
  return Object.assign(new Error(message), { code });
}

// A Cosmos client whose database creation fails with each of `failures` in turn, then succeeds.
function fakeClient(failures = []) {
  const created = { databases: [], containers: [] };
  const pending = [...failures];
  const database = {
    containers: {
      // Like the SDK, creating rewrites the definition's partitionKey into an object.
      createIfNotExists: async (definition) => {
        created.containers.push(structuredClone(definition));
        definition.partitionKey = { paths: [definition.partitionKey] };
      },
    },
  };
  const client = {
    databases: {
      createIfNotExists: vi.fn(async ({ id }) => {
        if (pending.length > 0) throw pending.shift();
        created.databases.push(id);
        return { database };
      }),
    },
  };
  return { client, created };
}

function recordingLog() {
  const lines = [];
  return {
    lines,
    info: (line) => lines.push(String(line)),
    error: (line) => lines.push(String(line)),
  };
}

function run({ argv = [], environment = {}, failures } = {}) {
  const { client, created } = fakeClient(failures);
  const createClient = vi.fn(() => client);
  const wait = vi.fn(async () => {});
  const log = recordingLog();
  const exitCode = runInitCosmos({ argv, environment, createClient, wait, log });
  return { exitCode, client, created, createClient, wait, log };
}

describe('runInitCosmos', () => {
  it('creates the database and the containers with their partition keys and index policy', async () => {
    const { exitCode, created, createClient, log } = run();

    await expect(exitCode).resolves.toBe(0);
    expect(createClient).toHaveBeenCalledWith(EMULATOR);
    expect(created.databases).toEqual(['bikebuddy']);
    expect(created.containers).toEqual([
      { id: 'users', partitionKey: '/id' },
      { id: 'deletions', partitionKey: '/id' },
      {
        id: 'tours',
        partitionKey: '/userId',
        indexingPolicy: {
          indexingMode: 'consistent',
          automatic: true,
          includedPaths: [{ path: '/*' }],
          excludedPaths: [{ path: '/heatmapData/*' }, { path: '/images/*' }],
        },
      },
      {
        id: 'tracks',
        partitionKey: '/userId',
        indexingPolicy: {
          indexingMode: 'consistent',
          automatic: true,
          includedPaths: [{ path: '/*' }],
          excludedPaths: [{ path: '/heatmapData/*' }],
        },
      },
    ]);
    expect(log.lines).toEqual([
      '✓ database "bikebuddy"',
      '✓ container "users" (partitionKey /id)',
      '✓ container "deletions" (partitionKey /id)',
      '✓ container "tours" (partitionKey /userId)',
      '✓ container "tracks" (partitionKey /userId)',
      'Cosmos initialized.',
    ]);
  });

  it('uses the configured connection string and database', async () => {
    const connectionString = 'AccountEndpoint=http://127.0.0.1:8081/;AccountKey=a2V5==;';
    const { exitCode, created, createClient } = run({
      environment: { COSMOS_CONNECTION_STRING: connectionString, COSMOS_DATABASE: 'other' },
    });

    await expect(exitCode).resolves.toBe(0);
    expect(createClient).toHaveBeenCalledWith({
      endpoint: 'http://127.0.0.1:8081/',
      key: 'a2V5==',
    });
    expect(created.databases).toEqual(['other']);
  });

  it.each([
    'AccountEndpoint=http://localhost:8081/;AccountKey=a2V5;',
    'AccountKey=a2V5;AccountEndpoint=http://[::1]:8081/',
    'AccountEndpoint=HTTP://LOCALHOST:8081/;AccountKey=a2V5;',
  ])('accepts the local endpoint in %s', async (connectionString) => {
    const { exitCode } = run({ environment: { COSMOS_CONNECTION_STRING: connectionString } });

    await expect(exitCode).resolves.toBe(0);
  });

  it.each([
    'AccountEndpoint=https://bikebuddy-cosmos.documents.azure.com:443/;AccountKey=a2V5;',
    'AccountEndpoint=http://localhost.example.com:8081/;AccountKey=a2V5;',
    'AccountEndpoint=http://10.0.0.5:8081/;AccountKey=a2V5;',
    'AccountEndpoint=http://localhost:8081/;AccountEndpoint=https://x.documents.azure.com/;AccountKey=a2V5',
  ])('refuses the non-local endpoint in %s before connecting', async (connectionString) => {
    const { exitCode, createClient, log } = run({
      environment: { COSMOS_CONNECTION_STRING: connectionString },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain('only targets the local emulator');
  });

  it.each([
    'AccountKey=a2V5;',
    'AccountEndpoint=http://localhost:8081/',
    'accountendpoint=http://localhost:8081/;AccountKey=a2V5',
    'AccountKey=a2V5;XAccountEndpoint=http://localhost:8081/',
  ])('refuses the incomplete connection string %s', async (connectionString) => {
    const { exitCode, createClient, log } = run({
      environment: { COSMOS_CONNECTION_STRING: connectionString },
    });

    await expect(exitCode).resolves.toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain('needs an AccountEndpoint and an AccountKey');
  });

  it('refuses any argument', async () => {
    const { exitCode, createClient, log } = run({ argv: ['--force', 'now'] });

    await expect(exitCode).resolves.toBe(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(log.lines.join('\n')).toContain('Unexpected arguments: --force now');
  });

  it('retries while the emulator warms up, two seconds apart', async () => {
    const { exitCode, created, wait, log } = run({
      failures: [
        transient('The service is still starting'),
        transient('connect failed', 'ECONNREFUSED'),
        transient('read ECONNRESET'),
        transient('socket hang up'),
        transient('ServiceUnavailable'),
        transient('Request failed with status 503'),
      ],
    });

    await expect(exitCode).resolves.toBe(0);
    expect(created.databases).toEqual(['bikebuddy']);
    expect(wait.mock.calls).toEqual(Array.from({ length: 6 }, () => [2000]));
    expect(log.lines.slice(0, 2)).toEqual([
      '  emulator warming up, retry 1/30...',
      '  emulator warming up, retry 2/30...',
    ]);
  });

  it('gives up after thirty attempts', async () => {
    const failures = Array.from({ length: 30 }, () => transient('still starting'));
    const { exitCode, client, wait } = run({ failures });

    await expect(exitCode).resolves.toBe(1);
    expect(client.databases.createIfNotExists).toHaveBeenCalledTimes(30);
    expect(wait).toHaveBeenCalledTimes(29);
  });

  it('succeeds on the thirtieth attempt', async () => {
    const failures = Array.from({ length: 29 }, () => transient('still starting'));
    const { exitCode } = run({ failures });

    await expect(exitCode).resolves.toBe(0);
  });

  it('fails at once on an error that is not transient', async () => {
    const { exitCode, client, wait } = run({ failures: [new Error('Unauthorized')] });

    await expect(exitCode).resolves.toBe(1);
    expect(client.databases.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('fails at once on an error without a message or code', async () => {
    const { exitCode, wait } = run({ failures: [{}] });

    await expect(exitCode).resolves.toBe(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
