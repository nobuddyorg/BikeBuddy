'use strict';

// ZAP's passive API scan requests what .zap/openapi.yaml lists: every read, and never a write (#574).

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { registeredEndpoints } = require('./registeredEndpoints');

const ZAP_API_SURFACE = resolve(__dirname, '..', '..', '..', '.zap', 'openapi.yaml');

// Two-space paths and four-space methods, as the file is written; no YAML parser for one list.
function openApiOperations(yaml) {
  const operations = [];
  let path = '';
  for (const line of yaml.split('\n')) {
    path = /^ {2}\/(\S+):$/.exec(line)?.[1] ?? path;
    const method = /^ {4}(get|put|post|patch|delete):$/.exec(line)?.[1];
    if (method) operations.push(`${method.toUpperCase()} ${path}`);
  }
  return operations;
}

describe("ZAP's map of the API (.zap/openapi.yaml)", () => {
  test('lists every registered GET route for the passive scan, and no write', () => {
    const listed = openApiOperations(readFileSync(ZAP_API_SURFACE, 'utf8'));
    const reads = registeredEndpoints(vi).filter((endpoint) => endpoint.startsWith('GET '));

    expect([...listed].sort()).toEqual([...reads].sort());
  });
});
