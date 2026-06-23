'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { tourMetaSchema, uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// PATCH /api/tours/{tourId} — edit a tour's name/description. Only name and
// description are editable; everything else (heatmapData, images, gpxFileUrl,
// ...) is preserved by reading the existing doc and patching in place.
async function editTour(request, auth = authenticate, getContainer = toursContainer) {
  const user = await auth(request);
  if (!user) return unauthorized();

  const tourId = request.params.tourId;
  const badParam = uuidParamError({ tourId });
  if (badParam) return badParam;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid JSON body — treated as no changes, validated below
  }
  const parsed = tourMetaSchema.safeParse(body ?? {});
  if (!parsed.success) return error(400, parsed.error.issues[0].message);

  const container = getContainer();

  let tour;
  try {
    ({ resource: tour } = await container.item(tourId, user.userId).read());
  } catch (err) {
    if (err.code !== 404) throw err;
  }
  if (!tour) return error(404, 'Tour not found');

  if (parsed.data.name !== undefined) tour.name = parsed.data.name;
  if (parsed.data.description !== undefined) tour.description = parsed.data.description;

  const { resource: updated } = await container.item(tourId, user.userId).replace(tour);
  return { status: 200, jsonBody: updated };
}

app.http('EditTour', {
  methods: ['patch'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  handler: (request) => editTour(request),
});

module.exports = { editTour };
