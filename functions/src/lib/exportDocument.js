// @ts-check
'use strict';

const COSMOS_SYSTEM_PROPERTIES = new Set(['_rid', '_self', '_etag', '_attachments', '_ts']);

// The export is the user's whole document, minus what Cosmos adds to every item.
const toExportDocument = (document) =>
  Object.fromEntries(
    Object.entries(document).filter(([key]) => !COSMOS_SYSTEM_PROPERTIES.has(key)),
  );

module.exports = { toExportDocument };
