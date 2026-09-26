'use strict';

// Usage: node scripts/init-cosmos.js; creates the database and containers in the local emulator only.

const { setTimeout: wait } = require('node:timers/promises');
const { CosmosClient } = require('@azure/cosmos');
const { runInitCosmos } = require('./lib/localCosmos');

runInitCosmos({
  argv: process.argv.slice(2),
  environment: process.env,
  createClient: (options) => new CosmosClient(options),
  wait,
  log: console,
}).then((exitCode) => {
  process.exitCode = exitCode;
});
