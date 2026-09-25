// teardown() deletes every tour of the run's user: the SKIP_AUTH dev user locally, the load-test account hosted.
import { deleteTour, getMe, listTours, uploadTour } from './api.js';
import { SIZES, gpxTrack } from './gpx.js';
import { PROFILE } from './profile.js';

export const SEED = PROFILE.seed;

export function setup() {
  getMe();
  const existing = listTours().map((tour) => tour.id);
  const tourIds = [...existing];
  for (let index = existing.length; index < SEED.tours; index++) {
    const points = index % SEED.largeEvery === 0 ? SIZES.long : SIZES.typical;
    const id = uploadTour(`Seed ride ${index + 1}`, gpxTrack(index, points));
    if (id) tourIds.push(id);
  }
  if (tourIds.length === 0) throw new Error('setup seeded no tours; is the API up?');
  return { tourIds };
}

export function teardown() {
  for (const tour of listTours()) deleteTour(tour.id);
}
