// @ts-check
'use strict';

const { ERROR_KEYS, unauthorized, error } = require('./http');
const { readItem } = require('./db');
const { invalidIdParams } = require('./validation');

/**
 * 401 without a caller, 400 for a malformed id before any read, 404 outside the caller's partition.
 *
 * @returns {Promise<{ response: object } | { user: { userId: string }, tour: any }>}
 */
async function loadOwnedTour(request, { authenticate, toursContainer, otherIdParams = {} }) {
  const user = await authenticate(request);
  if (!user) return { response: unauthorized() };

  const { tourId } = request.params;
  const [invalidParam] = invalidIdParams({ tourId, ...otherIdParams });
  if (invalidParam) return { response: error(400, ERROR_KEYS.invalidId) };

  const tour = await readItem(toursContainer(), { id: tourId, partitionKey: user.userId });
  if (!tour) return { response: error(404, ERROR_KEYS.tourNotFound) };

  return { user, tour };
}

module.exports = { loadOwnedTour };
