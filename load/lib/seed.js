// Shared setup/teardown. setup() provisions the user and uploads the profile's
// seed of deterministic tours; teardown() deletes every tour the user has (the
// DeleteTour handler removes the blobs before the document). Locally the user is
// the SKIP_AUTH dev user; a hosted run uses a dedicated load-test account.
import { deleteTour, getMe, listTours, uploadTour } from './api.js';
import { SIZES, gpxTrack } from './gpx.js';
import { PROFILE } from './profile.js';

export const SEED = PROFILE.seed;

export function setup() {
  getMe();
  const existing = listTours().map((tour) => tour.id);
  const tourIds = [...existing];
  for (let i = existing.length; i < SEED.tours; i++) {
    const points = i % SEED.largeEvery === 0 ? SIZES.long : SIZES.typical;
    const id = uploadTour(`Seed ride ${i + 1}`, gpxTrack(i, points));
    if (id) tourIds.push(id);
  }
  if (tourIds.length === 0) throw new Error('setup seeded no tours; is the API up?');
  return { tourIds };
}

export function teardown() {
  for (const tour of listTours()) deleteTour(tour.id);
}
