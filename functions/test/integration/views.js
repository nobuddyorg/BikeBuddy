'use strict';

// Reading back what a request may have changed, and where a signed URL points.

const CONTAINERS = new Set(['gpx-files', 'tour-images']);

// Azurite serves path-style URLs: /<account>/<container>/<blob name>.
function blobNameOf(url) {
  const segments = new URL(url).pathname.split('/').map(decodeURIComponent);
  const container = segments.findIndex((segment) => CONTAINERS.has(segment));
  return segments.slice(container + 1).join('/');
}

const imageUrlsOf = (images) => images.flatMap((image) => [image.url, image.thumbUrl]);

/** Every signed URL in a tour detail: its GPX file, each photo and thumbnail. */
const signedUrlsOf = (detail) => [
  ...(detail.gpxFileUrl ? [detail.gpxFileUrl] : []),
  ...imageUrlsOf(detail.images),
];

/** Every signed URL on a map answer: the photos with coordinates. */
const mapUrlsOf = (map) => map.flatMap((tour) => imageUrlsOf(tour.images));

// Signed URLs differ on every read, so the view keeps what they name instead.
function withoutSignedUrls(detail) {
  const { gpxFileUrl, images, ...tour } = detail;
  return {
    ...tour,
    gpxFile: gpxFileUrl ? blobNameOf(gpxFileUrl) : '',
    images: images.map(({ id, lat, lon, url }) => ({ id, lat, lon, blob: blobNameOf(url) })),
  };
}

const statusOf = async (url) => (await fetch(url)).status;

/** What the owner sees of one tour and their account, and whether its blobs still read. */
async function ownerView(api, { tourId }) {
  const [tour, tours, profile, exported] = await Promise.all([
    api.readJson(`/tours/${tourId}`),
    api.readJson('/tours'),
    api.readJson('/me'),
    api.readJson('/me/export'),
  ]);
  return {
    tour: withoutSignedUrls(tour),
    tours,
    profile,
    exportedTours: exported.tours,
    blobStatuses: await Promise.all(signedUrlsOf(tour).map(statusOf)),
  };
}

module.exports = { blobNameOf, signedUrlsOf, mapUrlsOf, statusOf, ownerView };
