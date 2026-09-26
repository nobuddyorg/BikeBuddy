'use strict';

const { apiRoute } = require('../lib/functionsApp');
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
const { settleAll, withRollback } = require('../lib/settle');
const { nameSchema, tourMetaSchema, tourMetaError } = require('../lib/validation');
const { toCreatedTourResponse } = require('../lib/tourResponse');
const { ERROR_KEYS, unauthorized, error } = require('../lib/http');
const { TOUR_SCHEMA_VERSION } = require('../lib/schemaVersion');
const { storedTrackStats } = require('../lib/tourStats');
const { newTrackDocument } = require('../lib/tourTrack');
const { refuseOverRate } = require('../lib/rateLimit');
const { refuseOverQuota } = require('../lib/userQuota');

const METADATA_FIELDS = ['name', 'description'];

async function readUpload(request, parseFile) {
  try {
    return { file: await parseFile(request, { fieldNames: METADATA_FIELDS }) };
  } catch (parseError) {
    if (parseError.status !== 400) throw parseError;
    return { response: error(400, parseError.message) };
  }
}

// Pages loaded before #579 send the metadata in the query string; the form fields win.
function uploadMetadata(request, fields) {
  const valueOf = (field) => fields[field] ?? request.query.get(field) ?? undefined;
  return tourMetaSchema.safeParse({ name: valueOf('name'), description: valueOf('description') });
}

async function readTrack(buffer, parseTrack) {
  if (!looksLikeXml(buffer)) {
    return { response: error(400, ERROR_KEYS.gpxInvalid) };
  }
  try {
    return { track: await parseTrack(buffer) };
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

function newTourDocument({ tourId, userId, metadata, track, file, gpxFileUrl, uploadedAt }) {
  return {
    id: tourId,
    userId,
    schemaVersion: TOUR_SCHEMA_VERSION,
    name: metadata.name ?? trackName(track.name),
    description: metadata.description ?? '',
    gpxFileUrl,
    gpxBytes: file.buffer.length,
    pointCount: track.heatmapData.length,
    images: [],
    createdAt: track.date ?? uploadedAt.toISOString(),
    ...storedTrackStats(track),
  };
}

// Blob, then track, then tour, each rolled back if a later write fails: a tour never points at a
// missing GPX or track.
async function uploadTour(
  request,
  {
    authenticate = authMiddleware.authenticate,
    deletionsContainer = db.deletionsContainer,
    toursContainer = db.toursContainer,
    tracksContainer = db.tracksContainer,
    gpxContainer = blobStorage.gpxContainer,
    parseFile = parseMultipart,
    parseTrack = parseGpxOffThread,
    rateLimiter = system.uploadRateLimiter,
    newId = system.newId,
    now = system.currentTime,
  } = {},
) {
  const user = await authenticate(request);
  if (!user) return unauthorized();
  const refused = await refusePendingDeletion(user, deletionsContainer);
  if (refused) return refused;
  const { userId } = user;
  const throttled = refuseOverRate(rateLimiter, { userId, now: now() });
  if (throttled) return throttled;

  const upload = await readUpload(request, parseFile);
  if (upload.response) return upload.response;
  const metadata = uploadMetadata(request, upload.file.fields);
  if (!metadata.success) return tourMetaError(metadata.error);
  // Before the parse, which is the costly part (#549).
  const overQuota = await refuseOverQuota({
    userId,
    toursContainer,
    adding: { tours: 1, bytes: upload.file.buffer.length },
  });
  if (overQuota) return overQuota;
  const gpx = await readTrack(upload.file.buffer, parseTrack);
  if (gpx.response) return gpx.response;

  const tourId = newId();
  const blobName = gpxBlobName({ userId, tourId });
  const container = await gpxContainer();
  const tour = newTourDocument({
    tourId,
    userId,
    metadata: metadata.data,
    track: gpx.track,
    file: upload.file,
    gpxFileUrl: blobStorage.blobUrl(container, blobName),
    uploadedAt: now(),
  });

  await blobStorage.uploadBlob(container, {
    blobName,
    data: upload.file.buffer,
    contentType: 'application/gpx+xml',
  });
  const deleteBlob = () => blobStorage.deleteBlobIfExists(container, blobName);
  const { heatmapData, segmentStarts } = gpx.track;
  const trackDocument = newTrackDocument({ tourId, userId, heatmapData, segmentStarts });
  await withRollback(() => db.createItem(tracksContainer(), trackDocument), deleteBlob);
  await withRollback(
    () => db.createItem(toursContainer(), tour),
    () =>
      settleAll(
        [
          db.deleteItemIfExists(tracksContainer(), { id: tourId, partitionKey: userId }),
          deleteBlob(),
        ],
        `Tour ${tourId} was not created, and its track or GPX was not rolled back`,
      ),
  );

  return {
    status: 201,
    headers: { Location: `/api/v1/tours/${tourId}` },
    jsonBody: toCreatedTourResponse(tour),
  };
}

apiRoute('UploadTour', {
  methods: ['post'],
  route: 'tours',
  unversionedRoute: 'tours/upload',
  /* v8 ignore next */
  handler: (request) => uploadTour(request),
});

module.exports = { uploadTour };
