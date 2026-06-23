'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { gpxContainer } = require('../lib/blobStorage');
const { uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob.
// Reading/deleting with the userId partition key enforces ownership.
async function deleteTour(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getGpxContainer = gpxContainer,
) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const tourId = request.params.tourId;
  const badParam = uuidParamError({ tourId });
  if (badParam) return badParam;

  const { userId } = user;

  let tour;
  try {
    ({ resource: tour } = await getToursContainer().item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) return error(404, 'Tour not found');

  const container = await getGpxContainer();
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
  await getToursContainer().item(tourId, userId).delete();

  return { status: 204 };
}

app.http('DeleteTour', {
  methods: ['delete'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  handler: (request) => deleteTour(request),
});

module.exports = { deleteTour };
