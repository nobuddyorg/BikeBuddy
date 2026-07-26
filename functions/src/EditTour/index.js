'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { tourMetaSchema, tourMetaError, uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

const EDITABLE_FIELDS = ['name', 'description', 'createdAt'];

// PATCH /api/tours/{tourId} — edit a tour's name/description/date. Only the
// EDITABLE_FIELDS are writable; everything else (heatmapData, images,
// gpxFileUrl, ...) is left untouched.
//
// The write is an atomic per-field patch, not a .replace(tour) of the doc read
// above: replace rewrites every field from a snapshot taken before the request,
// so a concurrent write landing in between is silently discarded. The realistic
// case isn't two edits racing — it's an edit overlapping a photo upload, which
// appends via patch '/images/-' (see UploadImage) and would be wiped out by a
// replace, losing the image and orphaning its blob. Patching only the fields
// that actually changed makes that impossible by construction, so no ETag or
// retry loop is needed here (unlike DeleteImage, which must rewrite an array).
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
  if (!parsed.success) return tourMetaError(parsed.error);

  const container = getContainer();

  const tour = await readItem(container, tourId, user.userId);
  if (!tour) return error(404, 'Tour not found');

  const operations = EDITABLE_FIELDS.filter((field) => parsed.data[field] !== undefined).map(
    (field) => ({ op: 'set', path: `/${field}`, value: parsed.data[field] }),
  );
  // Cosmos rejects an empty operations array, and there is nothing to write.
  if (operations.length === 0) return { status: 200, jsonBody: tour };

  const { resource: updated } = await container.item(tourId, user.userId).patch(operations);
  return { status: 200, jsonBody: updated };
}

app.http('EditTour', {
  methods: ['patch'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => editTour(request),
});

module.exports = { editTour };
