'use strict';

const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { gpxContainer } = require('../lib/blobStorage');
const { parseMultipart } = require('../lib/parseMultipart');
const { parseGpx } = require('../lib/parseGpx');
const { tourMetaSchema } = require('../lib/validation');

// GPX/XML files start with "<?xml" or "<gpx" (optionally preceded by a UTF-8 BOM).
function isXmlMagic(buffer) {
  const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
  const start = buffer.slice(0, 3).equals(BOM) ? buffer.slice(3) : buffer;
  const header = start.slice(0, 5).toString('ascii');
  return header.startsWith('<?xml') || header.startsWith('<gpx');
}

module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getToursContainer = toursContainer,
  getGpxContainer = gpxContainer,
  parseFile = parseMultipart,
) {
  if (!(await auth(context, req))) return;
  const { userId } = context;

  // Parse optional metadata fields from query string.
  const metaParsed = tourMetaSchema.safeParse({
    name: req.query?.name,
    description: req.query?.description,
  });
  if (!metaParsed.success) {
    context.res = { status: 400, body: { error: metaParsed.error.issues[0].message } };
    return;
  }

  let file;
  try {
    file = await parseFile(req);
  } catch (err) {
    context.res = { status: err.status ?? 500, body: { error: err.message } };
    return;
  }

  if (!isXmlMagic(file.buffer)) {
    context.res = {
      status: 400,
      body: { error: 'File does not appear to be a valid GPX/XML file' },
    };
    return;
  }

  let parsed;
  try {
    parsed = parseGpx(file.buffer);
  } catch {
    context.res = { status: 400, body: { error: 'Could not parse GPX file' } };
    return;
  }

  const tourId = uuidv4();
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
    createdAt: new Date().toISOString(),
  };

  // Blob upload and Cosmos DB create are independent — run in parallel.
  await Promise.all([
    blockBlob.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: 'application/gpx+xml' },
    }),
    getToursContainer().items.create(tour),
  ]);

  context.res = {
    status: 201,
    body: {
      tourId: tour.id,
      gpxFileUrl: tour.gpxFileUrl,
      name: tour.name,
      distance: tour.distance,
      createdAt: tour.createdAt,
    },
  };
};
