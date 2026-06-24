'use strict';

const { CosmosClient } = require('@azure/cosmos');

let cosmosClient;
function getClient() {
  if (!cosmosClient) cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  return cosmosClient;
}

// Read a document by id within its partition, returning the resource or
// undefined. A missing item surfaces as a thrown 404 (real Cosmos) or a
// resolved resource of undefined (emulator); both are normalised to undefined.
async function readItem(container, id, partitionKey) {
  try {
    const { resource } = await container.item(id, partitionKey).read();
    return resource;
  } catch (err) {
    if (err.code !== 404) throw err;
    return undefined;
  }
}

module.exports = {
  usersContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('users'),
  toursContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('tours'),
  readItem,
};
