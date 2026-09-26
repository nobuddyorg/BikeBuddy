// @ts-check
'use strict';

const { CosmosClient } = require('@azure/cosmos');
const profiling = require('./profiling');

let cosmosClient;
function getClient() {
  if (!cosmosClient) {
    // `plugins` is a supported but untyped CosmosClientOptions field.
    cosmosClient = new CosmosClient(
      /** @type {import('@azure/cosmos').CosmosClientOptions} */ ({
        connectionString: process.env.COSMOS_CONNECTION_STRING ?? '',
        ...(profiling.isEnabled(process.env) && {
          plugins: [
            {
              on: 'request',
              plugin: profiling.cosmosPlugin({
                write: (line) => console.log(line),
                now: () => performance.now(),
              }),
            },
          ],
        }),
      }),
    );
  }
  return cosmosClient;
}

const statusOf = (error) => /** @type {{ code?: number }} */ (error).code;

// A missing item throws a 404 on real Cosmos and resolves undefined on the emulator.
async function readItem(container, { id, partitionKey }) {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource;
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
    return undefined;
  }
}

// fetchAll() still drains every page; this bounds each round trip, not the result.
const MAX_ITEMS_PER_REQUEST = 100;

// Filtering on @userId and passing it as partition key confines the read to the caller.
async function queryUserItems(container, { userId, query, maxItemCount = MAX_ITEMS_PER_REQUEST }) {
  const { resources } = await container.items
    .query(
      { query, parameters: [{ name: '@userId', value: userId }] },
      { partitionKey: userId, maxItemCount },
    )
    .fetchAll();
  return resources;
}

async function createItem(container, document) {
  const { resource } = await container.items.create(document);
  return resource;
}

// A concurrent create of the same id answers 409; the winner's item is returned.
async function createItemOrReadExisting(container, { document, partitionKey }) {
  try {
    return await createItem(container, document);
  } catch (error) {
    if (statusOf(error) !== 409) throw error;
    return readItem(container, { id: document.id, partitionKey });
  }
}

async function upsertItem(container, document) {
  const { resource } = await container.items.upsert(document);
  return resource;
}

// With an `etag`, rejects with a 412 when the stored item no longer carries it.
async function patchItem(container, { id, partitionKey, operations, etag }) {
  const options = etag ? { accessCondition: { type: 'IfMatch', condition: etag } } : {};
  const { resource } = await container.item(id, partitionKey).patch(operations, options);
  return resource;
}

// Rejects with a 412 when the stored item no longer carries `etag`.
async function replaceItemIfMatch(container, { document, partitionKey, etag }) {
  const { resource } = await container
    .item(document.id, partitionKey)
    .replace(document, { accessCondition: { type: 'IfMatch', condition: etag } });
  return resource;
}

async function deleteItem(container, { id, partitionKey }) {
  await container.item(id, partitionKey).delete();
}

async function deleteItemIfExists(container, { id, partitionKey }) {
  try {
    await deleteItem(container, { id, partitionKey });
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
  }
}

const database = () => getClient().database(process.env.COSMOS_DATABASE);

module.exports = {
  usersContainer: () => database().container('users'),
  toursContainer: () => database().container('tours'),
  // Queued and checked (pendingDeletion.js) by the API, drained by the scheduled deletion job.
  deletionsContainer: () => database().container('deletions'),
  readItem,
  queryUserItems,
  createItem,
  createItemOrReadExisting,
  upsertItem,
  patchItem,
  replaceItemIfMatch,
  deleteItem,
  deleteItemIfExists,
  MAX_ITEMS_PER_REQUEST,
};
