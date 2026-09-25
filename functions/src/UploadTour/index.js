'use strict';

const { app } = require('../lib/functionsApp');
const { withFailureResponse } = require('../lib/failureResponse');
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../lib/db');
const { refusePendingDeletion } = require('../lib/pendingDeletion');
const blobStorage = require('../lib/blobStorage');
const system = require('../lib/system');
const { parseMultipart } = require('../lib/parseMultipart');
const { InvalidGpxError, NoTrackPointsError } = require('../lib/parseGpx');
const { parseGpxOffThread } = require('../lib/parseGpxOffThread');
const { looksLikeXml } = require('../lib/fileSignatures');
const { gpxBlobName } = require('../lib/blobNames');
const { withRollback } = require('../lib/settle');
const { nameSchema, tourMetaSchema, tourMetaError } = require('../lib/validation');
const { toCreatedTourResponse } = require('../lib/tourResponse');
const { ERROR_KEYS, unauthorized, error } = require('../lib/http');
const { TOUR_SCHEMA_VERSION } = require('../lib/schemaVersion');

async function readGpxUpload(request, { parseFile, parseTrack }) {
  let file;
  try {
    file = await parseFile(request);
  } catch (parseError) {
    if (parseError.status !== 400) throw parseError;
    return { response: error(400, parseError.message) };
  }
  if (!looksLikeXml(file.buffer)) {
    return { response: error(400, ERROR_KEYS.gpxInvalid) };
  }
  try {
    return { file, track: await parseTrack(file.buffer) };
  } catch (gpxError) {
    if (gpxError instanceof NoTrackPointsError)
      return { response: error(400, ERROR_KEYS.gpxNoTrack) };
    if (!(gpxError instanceof InvalidGpxError)) throw gpxError;
    return { response: error(400, ERROR_KEYS.gpxInvalid) };
  }
}

// The file's own name passes the same rules as a typed one, or the tour gets the default.
function trackName(name) {
  const parsed = nameSchema.safeParse(name ?? '');
  return parsed.success ? parsed.data : 'Untitled Tour';
}

function newTourDocument({ tourId, userId, metadata, track, gpxFileUrl, uploadedAt }) {
  return {
    id: tourId,
    userId,
    schemaVersion: TOUR_SCHEMA_VERSION,
    name: metadata.name ?? trackName(track.name),
    description: metadata.description ?? '',
    gpxFileUrl,
    heatmapData: track.heatmapData,
    images: [],
    distance: track.distanceKm,
    createdAt: track.date ?? uploadedAt.toISOString(),
    elevationGain: track.elevationGain,
    elevationLoss: track.elevationLoss,
    minElevation: track.minElevation,
    maxElevation: track.maxElevation,
    durationSeconds: track.durationSeconds,
    movingSeconds: track.movingSeconds,
    avgSpeed: track.avgSpeed,
  };
}

// Blob first, rolled back if the create fails: a tour never points at a missing GPX.
async function uploadTour(
  request,
  {
    authenticate = authMiddleware.authenticate,
    deletionsContainer = db.deletionsContainer,
    toursContainer = db.toursContainer,
    gpxContainer = blobStorage.gpxContainer,
    parseFile = parseMultipart,
    parseTrack = parseGpxOffThread,
    newId = system.newId,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const refused = await refusePendingDeletion(user, deletionsContainer);
  if (refused) return refused;
  const { userId } = user;

  const metadata = tourMetaSchema.safeParse({
    name: request.query.get('name') ?? undefined,
    description: request.query.get('description') ?? undefined,
  });
  if (!metadata.success) return tourMetaError(metadata.error);

  const upload = await readGpxUpload(request, { parseFile, parseTrack });
  if (upload.response) return upload.response;

  const tourId = newId();
  const blobName = gpxBlobName({ userId, tourId });
  const container = await gpxContainer();
  const tour = newTourDocument({
    tourId,
    userId,
    metadata: metadata.data,
    track: upload.track,
    gpxFileUrl: blobStorage.blobUrl(container, blobName),
    uploadedAt: now(),
  });

  await blobStorage.uploadBlob(container, {
    blobName,
    data: upload.file.buffer,
    contentType: 'application/gpx+xml',
  });
  await withRollback(
    () => db.createItem(toursContainer(), tour),
    () => blobStorage.deleteBlobIfExists(container, blobName),
  );

  return { status: 201, jsonBody: toCreatedTourResponse(tour) };
}

app.http('UploadTour', {
  methods: ['post'],
  authLevel: 'anonymous',
  route: 'tours/upload',
  /* v8 ignore next */
  handler: withFailureResponse((request) => uploadTour(request)),
});

module.exports = { uploadTour };
