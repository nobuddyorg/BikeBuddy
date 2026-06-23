'use strict';

const { z } = require('zod');
const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');

// Only name and description are editable; everything else (heatmapData, images,
// gpxFileUrl, ...) is preserved by reading the existing doc and patching in place.
const editSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

// PATCH /api/tours/{tourId} — edit a tour's name/description.
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getContainer = toursContainer,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;
  const tourId = req.params?.tourId;

  const parsed = editSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    context.res = { status: 400, body: { error: parsed.error.issues[0].message } };
    return;
  }

  const container = getContainer();

  // Read within the caller's partition (ownership): another user's tour isn't found.
  let tour;
  try {
    ({ resource: tour } = await container.item(tourId, userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) {
    context.res = { status: 404, body: { error: 'Tour not found' } };
    return;
  }

  if (parsed.data.name !== undefined) tour.name = parsed.data.name;
  if (parsed.data.description !== undefined) tour.description = parsed.data.description;

  const { resource: updated } = await container.item(tourId, userId).replace(tour);
  context.res = { status: 200, body: updated };
};
