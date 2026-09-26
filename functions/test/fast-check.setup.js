'use strict';

// A failure prints its seed and path; FC_SEED and FC_PATH replay exactly that run.
const fc = require('fast-check');

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined;
const path = process.env.FC_PATH || undefined;

fc.configureGlobal({
  numRuns: 200,
  ...(seed !== undefined && { seed }),
  ...(path && { path, endOnFailure: true }),
});
