// @ts-check
'use strict';

const COSMOS_SYSTEM_PROPERTIES = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);
// Unsigned storage references open nothing; the export carries signed links in their place.
const TOUR_STORAGE_REFERENCES = new Set(['gpxFileUrl']);
const IMAGE_STORAGE_REFERENCES = new Set(['blobName']);

/** @param {Record<string, unknown>} document @param {Set<string>} keys */
const without = (document, keys) =>
  Object.fromEntries(Object.entries(document).filter(([key]) => !keys.has(key)));

// The export is the user's whole document, minus what Cosmos adds to every item.
const toExportDocument = (document) => without(document, COSMOS_SYSTEM_PROPERTIES);

/**
 * A stored tour with signed links to its files: the GPX when it has one, and each photo in order.
 *
 * @param {{ images?: Record<string, unknown>[] } & Record<string, unknown>} tour
 * @param {{ gpxFileUrl?: string, imageUrls: string[] }} links
 */
function toExportTour(tour, { gpxFileUrl, imageUrls }) {
  const images = (tour.images ?? []).map((image, index) => ({
    ...without(image, IMAGE_STORAGE_REFERENCES),
    url: imageUrls[index],
  }));
  return {
    ...without(toExportDocument(tour), TOUR_STORAGE_REFERENCES),
    images,
    ...(gpxFileUrl && { gpxFileUrl }),
  };
}

module.exports = { toExportDocument, toExportTour };
