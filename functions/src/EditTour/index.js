'use strict';

const { app } = require('../lib/functionsApp');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const { loadOwnedTour } = require('../lib/ownedTour');
const { tourMetaSchema, tourMetaError } = require('../lib/validation');
const { ERROR_KEYS, error } = require('../lib/http');
const { toTourResponse } = require('../lib/tourResponse');

const EDITABLE_FIELDS = ['name', 'description', 'createdAt'];

async function readJsonBody(request) {
  try {
    return { body: await request.json() };
  } catch (parseError) {
    if (!(parseError instanceof SyntaxError)) throw parseError;
    return { response: error(400, ERROR_KEYS.tourInvalid) };
  }
}

// A per-field patch, not a replace: a photo appended to /images meanwhile must survive.
async function editTour(
  request,
  { authenticate = authMiddleware.authenticate, toursContainer = db.toursContainer } = {},
) {
  const guard = await loadOwnedTour(request, { authenticate, toursContainer });
  if (guard.response) return guard.response;
  const { tour } = guard;

  const input = await readJsonBody(request);
  if (input.response) return input.response;
  const parsed = tourMetaSchema.safeParse(input.body ?? {});
  if (!parsed.success) return tourMetaError(parsed.error);

  const operations = EDITABLE_FIELDS.filter((field) => parsed.data[field] !== undefined).map(
    (field) => ({ op: 'set', path: `/${field}`, value: parsed.data[field] }),
  );
  // Cosmos rejects an empty patch.
  if (operations.length === 0) return { status: 200, jsonBody: toTourResponse(tour) };

  const updated = await db.patchItem(toursContainer(), {
    id: tour.id,
    partitionKey: guard.user.userId,
    operations,
  });
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
