'use strict';

const { existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { app } = require('@azure/functions');

const SOURCE_DIRECTORY = resolve(__dirname, '..', '..', 'src');

/**
 * Loads every handler afresh and records what it hands app.http(), as the host would see it.
 *
 * @param {{ spyOn: Function }} vi the calling test's Vitest utilities
 */
function registeredEndpoints(vi) {
  const registrations = [];
  const http = vi
    .spyOn(app, 'http')
    .mockImplementation((_name, options) => registrations.push(options));
  try {
    for (const entry of readdirSync(SOURCE_DIRECTORY)) {
      const handler = join(SOURCE_DIRECTORY, entry, 'index.js');
      if (!existsSync(handler)) continue;
      delete require.cache[require.resolve(handler)];
      require(handler);
    }
  } finally {
    http.mockRestore();
  }
  return registrations.flatMap(({ methods, route }) =>
    methods.map((method) => `${method.toUpperCase()} ${route}`),
  );
}

module.exports = { registeredEndpoints };
