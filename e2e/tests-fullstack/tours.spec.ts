import { readFileSync } from 'node:fs';
import { expect, fullstackTest } from './fullstack-test';
import { PHOTOS } from './seed';
import { DEV_USER_ID, devUserBlobNames, devUserTours } from './store';

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>CI E2E Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
    <trkpt lat="48.1371" lon="11.5840"/>
  </trkseg></trk>
</gpx>`;

// The delete request waits out the Undo window (ui/undoableAction.js) first.
const AFTER_UNDO_WINDOW = { timeout: 20_000 };

fullstackTest('tour lifecycle: upload → list → detail → photo → delete', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible(); // real /api/me login

  const tourName = 'CI E2E Tour';
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).detail.locators.name).toHaveText(tourName);

  await on(page).detail.do.addPhotos(PHOTOS.untagged);
  await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(1);

  const [tour] = await devUserTours();
  const blobs = await devUserBlobNames();
  expect(blobs).toContain(`gpx-files/${DEV_USER_ID}/${tour.id}.gpx`);
  // The photo and its thumbnail.
  expect(
    blobs.filter((name) => name.startsWith(`tour-images/${DEV_USER_ID}/${tour.id}/`)),
  ).toHaveLength(2);

  await on(page).detail.do.deleteTour();
  await expect(on(page).list.row(tourName)()).toHaveCount(0);

  await expect.poll(devUserTours, AFTER_UNDO_WINDOW).toEqual([]);
  await expect.poll(devUserBlobNames, AFTER_UNDO_WINDOW).toEqual([]);
});

fullstackTest('download GPX from the detail panel', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `CI E2E GPX Download ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).detail.locators.name).toHaveText(tourName);

  const downloadPromise = page.waitForEvent('download');
  await on(page).detail.do.downloadGpx();
  const download = await downloadPromise;
  // Named by the signed URL's Content-Disposition (GetTour's gpxDownloadDisposition).
  expect(download.suggestedFilename()).toBe(`${tourName.replace(/[^a-z0-9-_]+/gi, '_')}.gpx`);
});

fullstackTest('multi-image upload: per-file success and error handling', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `CI E2E Multi ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).detail.locators.name).toHaveText(tourName);

  // setInputFiles takes no mixed array, so the valid photos are payloads too.
  await on(page).detail.do.addPhotos([
    { name: 'photo1.jpg', mimeType: 'image/jpeg', buffer: readFileSync(PHOTOS.untagged) },
    { name: 'photo2.jpg', mimeType: 'image/jpeg', buffer: readFileSync(PHOTOS.untagged) },
    { name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
  ]);

  // The invalid file never hits the network, so its tile has no retry.
  await expect(on(page).detail.locators.photos.errorTiles).toHaveCount(1);
  await expect(on(page).detail.locators.photos.retryButtons).toHaveCount(0);

  await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(2);
  await expect(on(page).detail.locators.photos.pendingTiles).toHaveCount(0);

  await on(page).detail.do.dismissPhotoError();
  await expect(on(page).detail.locators.photos.errorTiles).toHaveCount(0);
});
