'use strict';

// The thumbnail lives alongside the full image under a deterministic name —
// every blobName here always ends in .jpg (resizeImage always re-encodes),
// so nothing needs to store a second blob reference on the tour document.
function thumbBlobName(blobName) {
  return blobName.replace(/\.jpg$/, '_thumb.jpg');
}

module.exports = { thumbBlobName };
