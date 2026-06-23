'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');

// GET /api/tours/{tourId} — full tour document including heatmapData.
// Reading with the userId partition key enforces ownership: a tour in another
// user's partition simply isn't found, so it returns 404.
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getContainer = toursContainer,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;
  const tourId = req.params?.tourId;

  let tour;
  try {
    ({ resource: tour } = await getContainer().item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }

  if (!tour) {
    context.res = { status: 404, body: { error: 'Tour not found' } };
    return;
  }

  context.res = { status: 200, body: tour };
};
