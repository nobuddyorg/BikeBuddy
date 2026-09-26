// Requests in the frontend's order, with a reader's pause between screens: a tight loop is load no person makes.
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
// Built once per VU at init: generating a large file per iteration would load k6, not the API.
const TRACKS = {
  typical: gpxTrack(900001, SIZES.typical),
  long: gpxTrack(900002, SIZES.long),
  huge: gpxTrack(900003, SIZES.huge),
};

// One upload in twenty is a 100k-point ride, three in twenty a 10k-point one.
function uploadMix(roll) {
  if (roll < 0.05) return TRACKS.huge;
  if (roll < 0.2) return TRACKS.long;
  return TRACKS.typical;
}

const pick = (values) => values[Math.floor(Math.random() * values.length)];

export function browseList() {
  listTours();
  sleep(THINK_SECONDS);
}

export function browseMap() {
  getMap();
  sleep(THINK_SECONDS);
}

export function openDetail(tourIds) {
  getTour(pick(tourIds));
  sleep(THINK_SECONDS);
}

export function addTour() {
  uploadTour(`Load ride ${crypto.randomUUID().slice(0, 8)}`, uploadMix(Math.random()));
  sleep(THINK_SECONDS);
}

// A fresh tour per photo: the photo quota is per tour.
export function addPhoto() {
  const tourId = uploadTour(`Photo ride ${crypto.randomUUID().slice(0, 8)}`, TRACKS.typical);
  if (!tourId) return;
  const imageId = uploadImage(tourId, PHOTO);
  sleep(THINK_SECONDS);
  if (imageId) deleteImage(tourId, imageId);
  deleteTour(tourId);
}

export function editAndDelete() {
  const tourId = uploadTour(`Edit ride ${crypto.randomUUID().slice(0, 8)}`, TRACKS.typical);
  if (!tourId) return;
  editTour(tourId, { name: 'Renamed under load', description: 'Edited by k6' });
  sleep(THINK_SECONDS);
  editTour(tourId, { createdAt: new Date(Date.UTC(2024, 5, 1)).toISOString() });
  deleteTour(tourId);
  sleep(THINK_SECONDS);
}

export function exportAll() {
  exportData();
  sleep(THINK_SECONDS * 5);
}
