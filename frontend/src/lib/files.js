'use strict';

// Client-side upload validation. The backend re-validates by magic bytes; this
// is just fast UX feedback before the request is sent.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function isGpxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.gpx');
}

export function isImageFile(file) {
  if (!file) return false;
  return /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
}

// Returns an error message, or null when the GPX upload is acceptable.
export function validateGpxUpload(file) {
  if (!isGpxFile(file)) return 'Only .gpx files are accepted.';
  if (file.size > MAX_UPLOAD_BYTES) return 'File exceeds the 10 MB limit.';
  return null;
}

// Returns an error message, or null when the image upload is acceptable.
export function validateImageUpload(file) {
  if (!isImageFile(file)) return 'Only JPEG or PNG images are accepted.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image exceeds the 10 MB limit.';
  return null;
}
