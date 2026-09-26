'use strict';

// Not an endpoint: loaded with the handlers, it switches on the load-test instrumentation.
const { app } = require('../lib/functionsApp');
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
