'use strict';

const { CosmosClient } = require('@azure/cosmos');

let cosmosClient;
function getClient() {
  if (!cosmosClient) cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
  return cosmosClient;
}

module.exports = {
  usersContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('users'),
  toursContainer: () => getClient().database(process.env.COSMOS_DATABASE).container('tours'),
};
