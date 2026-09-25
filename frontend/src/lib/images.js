// @ts-check

// A photo carries its tour's id wherever it is shown outside that tour (the
// lightbox, a map pin), so deleting it never has to guess which tour it is in.
export function imagesOfTour(tour) {
  return (tour.images || []).map((image) => ({ ...image, tourId: tour.id }));
}

// Where the lightbox opens: the photo's position, or the first photo when it
// is gone.
export function indexOfImage(images, imageId) {
  return Math.max(
    0,
    images.findIndex((image) => image.id === imageId),
  );
}

// Prev/next wrap around the ends.
export function wrapIndex({ index, step, length }) {
  return (index + step + length) % length;
}

// Keeps an index valid after the list shrank.
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

// Scoped to the selected tour so its pins never show photos from others, and
// across every loaded tour on the full map.
export function geotaggedImages({ tours, selectedTourId }) {
  const shown = selectedTourId ? tours.filter((tour) => tour.id === selectedTourId) : tours;
  return shown.flatMap((tour) => imagesOfTour(tour).filter(hasLocation));
}
