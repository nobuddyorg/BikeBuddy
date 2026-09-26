'use strict';

// A route registered without a row in the authorization matrix would leave integration unnoticed.

const { registeredEndpoints } = require('./registeredEndpoints');
const {
  PUBLIC_ENDPOINTS,
  AUTHENTICATED_ENDPOINTS,
  TOUR_SCOPED_ENDPOINTS,
} = require('../integration/endpoints');

// At load, not inside a test: Stryker counts module-level code run in a test as covered by it.
const REGISTERED_ENDPOINTS = registeredEndpoints(vi);

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
