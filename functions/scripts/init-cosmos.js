'use strict';

// Creates the BikeBuddy database and containers in the local Cosmos DB emulator.
// Safe to run repeatedly (createIfNotExists). Dev-only — never run against prod.
//
// The vnext-preview emulator serves over plain HTTP, so no TLS handling is
// needed. The key below is the public well-known emulator key.

const { CosmosClient } = require('@azure/cosmos');

const connectionString =
  process.env.COSMOS_CONNECTION_STRING ||
  'AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b5n5NVmBSuvpToAw==';
const databaseId = process.env.COSMOS_DATABASE || 'bikebuddy';

// Partition keys match the production schema (see CLAUDE.md). The tours
// container excludes the large, never-queried heatmapData and images arrays
// from indexing to keep Serverless RU/storage costs down.
const containers = [
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

// After a container (re)start the gateway answers on :8081 before the pgcosmos
// data engine is ready ("still starting"), and the socket may briefly refuse
// connections — both are transient. Retry until the engine is warm.
function isTransient(err) {
  return /still starting|ECONNREFUSED|ECONNRESET|socket hang up|ServiceUnavailable|503/i.test(
    `${err.code || ''} ${err.message || ''}`,
  );
}

async function withRetry(fn, attempts = 30, delayMs = 2000) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      console.log(`  emulator warming up, retry ${attempt}/${attempts}...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const client = new CosmosClient(connectionString);

  // createIfNotExists is idempotent, so retrying the whole sequence is safe.
  // Note: it does not update an existing container's index policy — recreate
  // the container (or use container.replace) to re-apply.
  await withRetry(async () => {
    const { database } = await client.databases.createIfNotExists({ id: databaseId });
    console.log(`✓ database "${databaseId}"`);
    for (const def of containers) {
      await database.containers.createIfNotExists(def);
      console.log(`✓ container "${def.id}" (partitionKey ${def.partitionKey})`);
    }
  });
  console.log('Cosmos initialized.');
}

main().catch((err) => {
  console.error('Failed to initialize Cosmos emulator:', err.message);
  process.exitCode = 1;
});
