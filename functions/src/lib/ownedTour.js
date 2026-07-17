'use strict';

const { unauthorized, error } = require('./http');
const { readItem } = require('./db');
const { uuidParamError } = require('./validation');

// Shared preamble for tour-scoped endpoints: authenticate, validate the route
// UUIDs, then load the tour from the caller's partition — reading by userId is
// what enforces ownership (another user's tour simply isn't found → 404).
// Returns { user, tour } on success, or { response } to return immediately.
async function loadOwnedTour(request, auth, toursContainer, extraParams = {}) {
  const user = await auth(request);
  if (!user) return { response: unauthorized() };

  const { tourId } = request.params;
  const paramError = uuidParamError({ tourId, ...extraParams });
  if (paramError) return { response: paramError };

  const tour = await readItem(toursContainer(), tourId, user.userId);
  if (!tour) return { response: error(404, 'Tour not found') };

  return { user, tour };
}

module.exports = { loadOwnedTour };
