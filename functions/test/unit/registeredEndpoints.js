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
    .mockImplementation((name, options) => registrations.push({ name, ...options }));
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
  return registrations.flatMap(({ name, methods, route, handler }) =>
    methods.map((method) => ({ name, key: `${method.toUpperCase()} ${route}`, handler })),
  );
}

const VERSION_PREFIX = 'v1/';

/** Every registration under /api/v1/, keyed without the prefix as the matrix names it. */
const versionedEndpoints = (registrations) =>
  registrations
    .filter(({ key }) => key.split(' ')[1].startsWith(VERSION_PREFIX))
    .map((registration) => ({
      ...registration,
      key: registration.key.replace(` ${VERSION_PREFIX}`, ' '),
    }));

const unversionedEndpoints = (registrations) =>
  registrations.filter(({ key }) => !key.split(' ')[1].startsWith(VERSION_PREFIX));

module.exports = { registeredEndpoints, versionedEndpoints, unversionedEndpoints };
