'use strict';

const { app } = require('@azure/functions');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer, readItem } = require('../lib/db');
const { tourMetaSchema, tourMetaError, uuidParamError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');
const { toTourResponse } = require('../lib/tourResponse');

const EDITABLE_FIELDS = ['name', 'description', 'createdAt'];

// PATCH /api/tours/{tourId} — only EDITABLE_FIELDS are writable.
//
// An atomic per-field patch, not a .replace() of the document read above: the
// realistic race isn't two edits, it's an edit overlapping a photo upload,
// whose '/images/-' append a replace would wipe out. Touching only the changed
// fields rules that out by construction, so unlike DeleteImage — which has to
// rewrite an array — this needs no ETag or retry loop.
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
  if (operations.length === 0) return { status: 200, jsonBody: toTourResponse(tour) };

  const { resource: updated } = await container.item(tourId, user.userId).patch(operations);
  return { status: 200, jsonBody: toTourResponse(updated) };
}

app.http('EditTour', {
  methods: ['patch'],
  authLevel: 'anonymous',
  route: 'tours/{tourId}',
  /* v8 ignore next */
  handler: (request) => editTour(request),
});

module.exports = { editTour };
