'use strict';

// A route registered without a row in the authorization matrix would leave integration unnoticed.

const { existsSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { app } = require('@azure/functions');
const {
  PUBLIC_ENDPOINTS,
  AUTHENTICATED_ENDPOINTS,
  TOUR_SCOPED_ENDPOINTS,
} = require('../integration/endpoints');

const SOURCE_DIRECTORY = resolve(__dirname, '..', '..', 'src');

// Loads every handler afresh and records what it hands app.http(), as the host would see it.
function registeredEndpoints() {
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

// At load, not inside a test: Stryker counts module-level code run in a test as covered by it.
const REGISTERED_ENDPOINTS = registeredEndpoints();

const asKeys = (endpoints) => endpoints.map(({ method, route }) => `${method} ${route}`);

describe('the authorization matrix', () => {
  test('names every registered route exactly once, public or authenticated', () => {
    const matrix = asKeys([...PUBLIC_ENDPOINTS, ...AUTHENTICATED_ENDPOINTS]);

    expect(new Set(matrix).size).toBe(matrix.length);
    expect([...matrix].sort()).toEqual([...REGISTERED_ENDPOINTS].sort());
  });

  test('treats every route under a tour id as tour-scoped', () => {
    expect(asKeys(TOUR_SCOPED_ENDPOINTS)).toEqual([
      'GET tours/{tourId}',
      'PATCH tours/{tourId}',
      'DELETE tours/{tourId}',
      'POST tours/{tourId}/images',
      'DELETE tours/{tourId}/images/{imageId}',
    ]);
  });
});
