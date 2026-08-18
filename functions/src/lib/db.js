'use strict';

const { CosmosClient } = require('@azure/cosmos');

let cosmosClient;
function getClient() {
  if (!cosmosClient) cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  return cosmosClient;
}

// A missing item is a thrown 404 on real Cosmos and a resolved undefined on the
// emulator; both are normalised to undefined here.
async function readItem(container, id, partitionKey) {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource;
  } catch (err) {
    if (err.code !== 404) throw err;
    return undefined;
  }
}

// fetchAll() still drains every continuation, so this bounds the round trip,
// not the result: years of tours cost several bounded responses instead of one
// unbounded one. ORDER BY createdAt rides the containers' '/*' range
// index, so paging adds no sort.
const MAX_ITEMS_PER_REQUEST = 100;

// The query must filter on @userId: passing that same id as the partition key
// is what confines a user's reads to their own data.
async function queryUserItems(container, userId, query, maxItemCount = MAX_ITEMS_PER_REQUEST) {
  const { resources } = await container.items
    .query(
      { query, parameters: [{ name: '@userId', value: userId }] },
      { partitionKey: userId, maxItemCount },
    )
    .fetchAll();
  return resources;
}

module.exports = {
  usersContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('users'),
  toursContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('tours'),
  // Drained by the scheduled deletion job, never by the public API (GDPR).
  deletionsContainer: () =>
    getClient().database(process.env.COSMOS_DATABASE).container('deletions'),
  readItem,
  queryUserItems,
  MAX_ITEMS_PER_REQUEST,
};
