// @ts-check

// Photos shown outside their tour (lightbox, pins) carry its id, so a delete knows the tour.
export function imagesOfTour(tour) {
  return (tour.images || []).map((image) => ({ ...image, tourId: tour.id }));
}

// Falls back to the first photo when this one is gone.
export function indexOfImage(images, imageId) {
  return Math.max(
    0,
    images.findIndex((image) => image.id === imageId),
  );
}

export function wrapIndex({ index, step, length }) {
  return (index + step + length) % length;
}

export function clampIndex(index, length) {
  return Math.max(0, Math.min(index, length - 1));
}

export function withoutImage(images, imageId) {
  return images.filter((image) => image.id !== imageId);
}

// Undo can race a re-fetch that already brought the photo back.
export function withImageRestored(images, image) {
  return images.some((existing) => existing.id === image.id) ? images : [...images, image];
}

const hasLocation = (image) => typeof image.lat === 'number' && typeof image.lon === 'number';

// The selected tour's photos only, or every tour's on the full map.
// Inclusive edges, like the in-view list (lib/tours.js).
export function photosWithin(photos, { south, west, north, east }) {
  return photos.filter(
    ({ lat, lon }) => lat >= south && lat <= north && lon >= west && lon <= east,
  );
}

export function geotaggedImages({ tours, selectedTourId }) {
  const shown = selectedTourId ? tours.filter((tour) => tour.id === selectedTourId) : tours;
  return shown.flatMap((tour) => imagesOfTour(tour).filter(hasLocation));
}
