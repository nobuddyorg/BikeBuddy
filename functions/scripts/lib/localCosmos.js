'use strict';

const { exitCodeOf } = require('./cli');

// The emulator's well-known key, public by design.
const EMULATOR_CONNECTION_STRING =
  'AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b5n5NVmBSuvpToAw==';
const DEFAULT_DATABASE_ID = 'bikebuddy';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const RETRY_ATTEMPTS = 30;
const RETRY_DELAY_MILLISECONDS = 2000;

// Mirrors infrastructure/cosmos.tf, which creates the deployed containers.
const CONTAINERS = [
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
];

// The client is built from these parts, so the endpoint checked is the one it connects to.
function parseConnectionString(connectionString) {
  const settings = Object.fromEntries(
    connectionString.split(';').map((entry) => {
      const [key, ...value] = entry.split('=');
      return [key, value.join('=')];
    }),
  );
  if (!settings.AccountEndpoint || !settings.AccountKey) {
    throw new Error('The Cosmos connection string needs an AccountEndpoint and an AccountKey');
  }
  return { endpoint: settings.AccountEndpoint, key: settings.AccountKey };
}

function assertLocalEndpoint(endpoint) {
  const { hostname } = new URL(endpoint);
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `Refusing to initialize ${hostname}: this script only targets the local emulator`,
    );
  }
}

// The emulator's gateway answers before its data engine is ready, and may briefly refuse connections.
function isTransient(error) {
  return /still starting|ECONNREFUSED|ECONNRESET|socket hang up|ServiceUnavailable|503/i.test(
    `${error.code} ${error.message}`,
  );
}

async function retryWhileWarmingUp({ operation, wait, log }) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS || !isTransient(error)) throw error;
      log.info(`  emulator warming up, retry ${attempt}/${RETRY_ATTEMPTS}...`);
      await wait(RETRY_DELAY_MILLISECONDS);
    }
  }
}

// createIfNotExists never updates an existing container's indexing policy.
async function createDatabaseAndContainers({ client, databaseId, log }) {
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  log.info(`✓ database "${databaseId}"`);
  for (const definition of CONTAINERS) {
    await database.containers.createIfNotExists(definition);
    log.info(`✓ container "${definition.id}" (partitionKey ${definition.partitionKey})`);
  }
}

// Resolves to the process exit code.
function runInitCosmos({ argv, environment, createClient, wait, log }) {
  return exitCodeOf({
    log,
    job: async () => {
      if (argv.length > 0) throw new Error(`Unexpected arguments: ${argv.join(' ')}`);
      const { endpoint, key } = parseConnectionString(
        environment.COSMOS_CONNECTION_STRING || EMULATOR_CONNECTION_STRING,
      );
      assertLocalEndpoint(endpoint);
      const client = createClient({ endpoint, key });
      const databaseId = environment.COSMOS_DATABASE || DEFAULT_DATABASE_ID;
      await retryWhileWarmingUp({
        operation: () => createDatabaseAndContainers({ client, databaseId, log }),
        wait,
        log,
      });
      log.info('Cosmos initialized.');
      return true;
    },
  });
}

module.exports = { runInitCosmos };
