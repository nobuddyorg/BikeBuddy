// @ts-check

// Fast UX feedback only — the backend re-validates by magic bytes.
// Each check lists its problems as i18n keys with their parameters; an empty
// list means the upload is fine.

const BYTES_PER_MEGABYTE = 1024 * 1024;
export const MAX_UPLOAD_BYTES = 10 * BYTES_PER_MEGABYTE;
const MAX_IMAGE_BYTES = 10 * BYTES_PER_MEGABYTE;
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
  if (!isGpxFile(file)) return [{ key: 'errors.gpxType', params: {} }];
  if (file.size > MAX_UPLOAD_BYTES) {
    const maxMegabytes = MAX_UPLOAD_BYTES / BYTES_PER_MEGABYTE;
    return [{ key: 'errors.gpxSize', params: { maxMegabytes } }];
  }
  return [];
}

export function validateImageUpload(file) {
  if (!isImageFile(file)) return [{ key: 'errors.imageType', params: {} }];
  if (file.size > MAX_IMAGE_BYTES) {
    const maxMegabytes = MAX_IMAGE_BYTES / BYTES_PER_MEGABYTE;
    return [{ key: 'errors.imageSize', params: { maxMegabytes } }];
  }
  return [];
}

export function validateImageBatch(files) {
  if (files.length > MAX_IMAGE_BATCH) {
    return [{ key: 'errors.tooManyImages', params: { max: MAX_IMAGE_BATCH } }];
  }
  return [];
}

export function validateImageQuota(existingCount) {
  if (existingCount >= MAX_TOUR_IMAGES) {
    return [{ key: 'errors.tourImageLimit', params: { max: MAX_TOUR_IMAGES } }];
  }
  return [];
}
