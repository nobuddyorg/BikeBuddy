'use strict';

const { CosmosClient } = require('@azure/cosmos');

let cosmosClient;
function getClient() {
  if (!cosmosClient) cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  return cosmosClient;
}

const db = () => getClient().database(process.env.COSMOS_DATABASE);

module.exports = {
  usersContainer: () => db().container('users'),
  toursContainer: () => db().container('tours'),
};
