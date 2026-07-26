'use strict';

// Cosmos hands back system properties on every resource (_rid, _self, _etag,
// _attachments, _ts) and the document also carries userId — the caller's Entra
// subject id. None of that is the client's business, so single-tour responses
// are projected explicitly, the way GetMe and the GetTours query already are
// (#360). ExportData deliberately does not use this: returning the stored
// document in full is the point of a portability export.
const toTourResponse = (tour) => ({
  id: tour.id,
  name: tour.name,
  description: tour.description,
  distance: tour.distance,
  createdAt: tour.createdAt,
  heatmapData: tour.heatmapData,
  images: tour.images,
  gpxFileUrl: tour.gpxFileUrl,
});

module.exports = { toTourResponse };
