// One iteration of each journey, in the order the frontend sends its requests,
// with a reader's pause between screens (a tight loop is load no person makes).
import { sleep } from 'k6';

import {
  deleteImage,
  deleteTour,
  editTour,
  exportData,
  getMap,
  getTour,
  listTours,
  uploadImage,
  uploadTour,
} from './api.js';
import { SIZES, gpxTrack } from './gpx.js';

const THINK_SECONDS = 1;
// The e2e suite's photo fixture: a real JPEG, so sharp does real work.
const PHOTO = open('../../e2e/fixtures/sample.jpg', 'b');
// Built once per VU at init: generating a 10k-point file per iteration would load k6, not the API.
const TRACKS = { typical: gpxTrack(900001, SIZES.typical), long: gpxTrack(900002, SIZES.long) };

const pick = (values) => values[Math.floor(Math.random() * values.length)];

/** The app's start: the list and the map. */
export function browseList() {
  listTours();
  sleep(THINK_SECONDS);
}

export function browseMap() {
  getMap();
  sleep(THINK_SECONDS);
}

/** Open one tour's detail panel. */
export function openDetail(tourIds) {
  getTour(pick(tourIds));
  sleep(THINK_SECONDS);
}

/** Upload a ride (a long one every fifth time). */
export function addTour() {
  const long = Math.random() < 0.2;
  uploadTour(`Load ride ${crypto.randomUUID().slice(0, 8)}`, long ? TRACKS.long : TRACKS.typical);
  sleep(THINK_SECONDS);
}

/** Add a photo to a fresh tour (the photo quota is per tour), then clean both up. */
export function addPhoto() {
  const tourId = uploadTour(`Photo ride ${crypto.randomUUID().slice(0, 8)}`, TRACKS.typical);
  if (!tourId) return;
  const imageId = uploadImage(tourId, PHOTO);
  sleep(THINK_SECONDS);
  if (imageId) deleteImage(tourId, imageId);
  deleteTour(tourId);
}

/** Rename a ride, correct its date, then delete it: the edit and delete paths. */
export function editAndDelete() {
  const tourId = uploadTour(`Edit ride ${crypto.randomUUID().slice(0, 8)}`, TRACKS.typical);
  if (!tourId) return;
  editTour(tourId, { name: 'Renamed under load', description: 'Edited by k6' });
  sleep(THINK_SECONDS);
  editTour(tourId, { createdAt: new Date(Date.UTC(2024, 5, 1)).toISOString() });
  deleteTour(tourId);
  sleep(THINK_SECONDS);
}

/** Download everything (GDPR export) for a heavy account. */
export function exportAll() {
  exportData();
  sleep(THINK_SECONDS * 5);
}
