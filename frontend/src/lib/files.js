'use strict';

// Fast UX feedback only — the backend re-validates by magic bytes.
// Each check returns an i18n message key, or null when the upload is fine.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BATCH = 20;
export const MAX_TOUR_IMAGES = 20;

export function isGpxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.gpx');
}

export function isImageFile(file) {
  if (!file) return false;
  return /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
}

export function validateGpxUpload(file) {
  if (!isGpxFile(file)) return 'errors.gpxType';
  if (file.size > MAX_UPLOAD_BYTES) return 'errors.gpxSize';
  return null;
}

export function validateImageUpload(file) {
  if (!isImageFile(file)) return 'errors.imageType';
  if (file.size > MAX_IMAGE_BYTES) return 'errors.imageSize';
  return null;
}

export function validateImageBatch(files) {
  if (files.length > MAX_IMAGE_BATCH) return 'errors.tooManyImages';
  return null;
}

export function validateImageQuota(existingCount) {
  if (existingCount >= MAX_TOUR_IMAGES) return 'errors.tourImageLimit';
  return null;
}
