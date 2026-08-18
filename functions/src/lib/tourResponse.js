'use strict';

// Cosmos returns its system properties on every resource, and the document also
// carries the caller's Entra subject id — so single-tour responses are projected
// explicitly, as GetMe and the GetTours query already are. ExportData
// stays off this on purpose: the full stored document is the point there.
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
