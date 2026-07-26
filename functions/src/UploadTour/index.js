'use strict';

const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { authenticate } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { gpxContainer } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { parseGpx } = require('../lib/parseGpx');
const { tourMetaSchema, tourMetaError } = require('../lib/validation');
const { unauthorized, error } = require('../lib/http');

// GPX/XML files start with "<?xml" or "<gpx" (optionally preceded by a UTF-8 BOM).
function isXmlMagic(buffer) {
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const start = buffer.slice(0, 3).equals(BOM) ? buffer.slice(3) : buffer;
  const header = start.slice(0, 5).toString('ascii');
  return header.startsWith('<?xml') || header.startsWith('<gpx');
}

// POST /api/tours/upload — parse a GPX upload, store it, create the tour.
async function uploadTour(
  request,
  auth = authenticate,
  getToursContainer = toursContainer,
  getGpxContainer = gpxContainer,
  parseFile = parseMultipart,
) {
  const user = await auth(request);
  if (!user) return unauthorized();
  const { userId } = user;

  const metaParsed = tourMetaSchema.safeParse({
    name: request.query.get('name') ?? undefined,
    description: request.query.get('description') ?? undefined,
  });
  if (!metaParsed.success) return tourMetaError(metaParsed.error);

  let file;
  try {
    file = await parseFile(request);
  } catch (err) {
    return error(err.status ?? 500, err.message);
  }

  if (!isXmlMagic(file.buffer)) {
    return error(400, 'File does not appear to be a valid GPX/XML file');
  }

  let parsed;
  try {
    parsed = parseGpx(file.buffer);
  } catch {
    return error(400, 'Could not parse GPX file');
  }

  const tourId = randomUUID();
  const container = await getGpxContainer();
  const blockBlob = container.getBlockBlobClient(`${userId}/${tourId}.gpx`);

  const tour = {
    id: tourId,
    userId,
    name: metaParsed.data.name ?? parsed.name ?? 'Untitled Tour',
    description: metaParsed.data.description ?? '',
    gpxFileUrl: blockBlob.url,
    heatmapData: parsed.heatmapData,
    images: [],
    distance: parsed.distanceKm,
    createdAt: parsed.date ?? new Date().toISOString(),
  };

  // Sequential, not Promise.all: the two writes are independent in that neither
  // needs the other's result, but they are not independent in consistency, and
  // Promise.all rejects on the first failure while the other write completes
  // anyway. Both partial states were reachable, and they are not equally bad —
  // a tour document referencing a GPX blob that was never written is visible in
  // the list and fails at download time, whereas an orphaned blob is invisible
  // and costs a few KB. So write the blob first and roll it back if the Cosmos
  // create fails, leaving only the recoverable state. The client still sees a
  // 500 either way, but a retry can no longer accumulate orphaned blobs.
  await blockBlob.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: 'application/gpx+xml' },
  });
  try {
    await getToursContainer().items.create(tour);
  } catch (err) {
    // Best-effort cleanup — the create failure is what the caller needs to see.
    await blockBlob.deleteIfExists().catch(() => {});
    throw err;
  }

  return {
    status: 201,
    jsonBody: {
      tourId: tour.id,
      gpxFileUrl: tour.gpxFileUrl,
      name: tour.name,
      distance: tour.distance,
      createdAt: tour.createdAt,
    },
  };
}

app.http('UploadTour', {
  methods: ['post'],
  authLevel: 'anonymous',
  route: 'tours/upload',
  /* v8 ignore next */
  handler: (request) => uploadTour(request),
});

module.exports = { uploadTour };
