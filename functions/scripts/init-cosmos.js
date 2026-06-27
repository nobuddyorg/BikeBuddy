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

async function main() {
  const client = new CosmosClient(connectionString);
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  console.log(`✓ database "${databaseId}"`);

  // Note: createIfNotExists does not update an existing container's index
  // policy — recreate the container (or use container.replace) to re-apply.
  for (const def of containers) {
    await database.containers.createIfNotExists(def);
    console.log(`✓ container "${def.id}" (partitionKey ${def.partitionKey})`);
  }
  console.log('Cosmos initialized.');
}

main().catch((err) => {
  console.error('Failed to initialize Cosmos emulator:', err.message);
  process.exitCode = 1;
});
