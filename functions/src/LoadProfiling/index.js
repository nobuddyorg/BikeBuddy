'use strict';

// Not an endpoint: the host loads it with the handlers (package.json "main"),
// and it only turns the load-test instrumentation on under LOAD_PROFILING=true.
const { app } = require('@azure/functions');
const profiling = require('../lib/profiling');

function setUp({ functionsApp, environment, instrumentation }) {
  if (!instrumentation.isEnabled(environment)) return false;
  const write = (line) => console.log(line);
  instrumentation.registerInvocationHooks(functionsApp, { now: () => performance.now(), write });
  instrumentation.startSampling({ write, readMemory: () => process.memoryUsage() });
  return true;
}

setUp({ functionsApp: app, environment: process.env, instrumentation: profiling });

module.exports = { setUp };
