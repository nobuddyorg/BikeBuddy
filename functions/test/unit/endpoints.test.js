'use strict';

// A route registered without a row in the authorization matrix would leave integration unnoticed.

const {
  registeredEndpoints,
  versionedEndpoints,
  unversionedEndpoints,
} = require('./registeredEndpoints');
const {
  PUBLIC_ENDPOINTS,
  AUTHENTICATED_ENDPOINTS,
  TOUR_SCOPED_ENDPOINTS,
} = require('../integration/endpoints');

// At load, not inside a test: Stryker counts module-level code run in a test as covered by it.
const REGISTERED_ENDPOINTS = registeredEndpoints(vi);
const VERSIONED_ENDPOINTS = versionedEndpoints(REGISTERED_ENDPOINTS);
const UNVERSIONED_ENDPOINTS = unversionedEndpoints(REGISTERED_ENDPOINTS);

const asKeys = (endpoints) => endpoints.map(({ method, route }) => `${method} ${route}`);
const MATRIX = asKeys([...PUBLIC_ENDPOINTS, ...AUTHENTICATED_ENDPOINTS]);

describe('the authorization matrix', () => {
  test('names every route under /api/v1/ exactly once, public or authenticated', () => {
    expect(new Set(MATRIX).size).toBe(MATRIX.length);
    expect([...MATRIX].sort()).toEqual(VERSIONED_ENDPOINTS.map(({ key }) => key).sort());
  });

  // The matrix runs against /api/v1/ only: an alias is covered because it is the same handler.
  test('keeps the paths from before /api/v1/ as aliases with the very same handler (#579)', () => {
    const renamed = { 'POST tours': 'POST tours/upload' };
    expect(UNVERSIONED_ENDPOINTS.map(({ key }) => key).sort()).toEqual(
      MATRIX.map((key) => renamed[key] ?? key).sort(),
    );
    for (const alias of UNVERSIONED_ENDPOINTS) {
      const versioned = VERSIONED_ENDPOINTS.find(({ name }) => `${name}Unversioned` === alias.name);
      expect(alias.handler).toBe(versioned.handler);
    }
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
