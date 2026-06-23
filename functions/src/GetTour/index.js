'use strict';

const { authMiddleware } = require('../middleware/authMiddleware');
const { toursContainer } = require('../lib/db');
const { imagesContainer, readSasUrl } = require('../lib/blobStorage');

// GET /api/tours/{tourId} — full tour document including heatmapData.
// Reading with the userId partition key enforces ownership: a tour in another
// user's partition isn't found, so it returns 404.
//
// Stored images are { id, blobName }; they're returned as { id, url } with a
// short-lived read SAS URL so the private container can be served directly.
module.exports = async function (
  context,
  req,
  auth = authMiddleware,
  getContainer = toursContainer,
  getImagesContainer = imagesContainer,
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

  if (tour.images?.length) {
    const container = await getImagesContainer();
    tour.images = await Promise.all(
      tour.images.map(async (img) => ({
        id: img.id,
        url: await readSasUrl(container.getBlockBlobClient(img.blobName)),
      })),
    );
  } else {
    tour.images = [];
  }

  context.res = { status: 200, body: tour };
};
