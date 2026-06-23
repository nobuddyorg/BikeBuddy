'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { gpxContainer } = require('../lib/blobStorage');
const { requireUuids } = require('../lib/validation');

// DELETE /api/tours/{tourId} — removes the tour document and its GPX blob.
// Reading/deleting with the userId partition key enforces ownership: a tour in
// another user's partition isn't found, so it returns 404 (not deletable).
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getToursContainer = toursContainer,
  getGpxContainer = gpxContainer,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;
  const tourId = req.params?.tourId;
  if (!requireUuids(context, { tourId })) return;

  // Confirm the tour exists in the caller's partition before deleting anything.
  let tour;
  try {
    ({ resource: tour } = await getToursContainer().item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) {
    context.res = { status: 404, body: { error: 'Tour not found' } };
    return;
  }

  // Remove the GPX blob, then the Cosmos document.
  const container = await getGpxContainer();
  await container.getBlockBlobClient(`${userId}/${tourId}.gpx`).deleteIfExists();
  await getToursContainer().item(tourId, userId).delete();

  context.res = { status: 204 };
};
