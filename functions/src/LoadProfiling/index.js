'use strict';

// Not an endpoint: loaded with the handlers (package.json "main"), it turns on
// the load-test instrumentation in lib/profiling.js when LOAD_PROFILING=true.
const { app } = require('@azure/functions');
const { enabled, registerInvocationHooks, startSampling } = require('../lib/profiling');

function setUp(appInstance = app, lib = { enabled, registerInvocationHooks, startSampling }) {
  if (!lib.enabled()) return false;
  lib.registerInvocationHooks(appInstance);
  lib.startSampling();
  return true;
}

setUp();

module.exports = { setUp };
