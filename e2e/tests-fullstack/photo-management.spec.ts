import { AFTER_UNDO_WINDOW, expect, fullstackTest } from './fullstack-test';
import { PHOTOS } from './seed';
import { devUserBlobNames } from './store';

// A photo is stored as its full image and its thumbnail (functions/src/UploadImage).
const storedPhotoBlobs = async () =>
  (await devUserBlobNames()).filter((name) => name.startsWith('tour-images/'));

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Photo Mgmt Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

fullstackTest(
  'deletes a single photo, leaving the rest of the gallery intact',
  async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    const tourName = `Photo Delete ${Date.now()}`;
    await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
    await expect(on(page).detail.locators.name).toHaveText(tourName);
    await on(page).detail.do.addPhotos(PHOTOS.untagged);
    await on(page).detail.do.addPhotos(PHOTOS.untagged);
    await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(2);

    await expect.poll(storedPhotoBlobs).toHaveLength(4);

    await on(page).detail.do.deletePhoto(0);
    await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(1);
    // The deleted photo's blobs are gone, the other photo's stay (#567).
    await expect.poll(storedPhotoBlobs, AFTER_UNDO_WINDOW).toHaveLength(2);
  },
);

fullstackTest('opens and closes the lightbox for a photo', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `Lightbox ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).detail.locators.name).toHaveText(tourName);
  await on(page).detail.do.addPhotos(PHOTOS.untagged);
  await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(1);

  await expect(on(page).modal.lightbox()).toBeHidden();
  await on(page).detail.do.openPhoto(0);
  await expect(on(page).modal.lightbox()).toBeVisible();
  await expect(on(page).modal.lightbox.locators.image).toHaveAttribute('src', /.+/);
  await on(page).a11y.check('lightbox');

  await on(page).modal.lightbox.do.close();
  await expect(on(page).modal.lightbox()).toBeHidden();
});

fullstackTest.describe('a failed photo upload', () => {
  fullstackTest.use({ allowedConsoleErrors: { matching: [/status of 500/] } });

  fullstackTest('is retried and succeeds the second time', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    const tourName = `Retry Upload ${Date.now()}`;
    await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
    await expect(on(page).detail.locators.name).toHaveText(tourName);

    // Only the first attempt fails; the retry goes to the real backend.
    let attempt = 0;
    await page.route('**/api/v1/tours/*/images', async (route) => {
      attempt++;
      if (attempt === 1) {
        await route.fulfill({ status: 500, body: 'Internal Server Error' });
      } else {
        await route.continue();
      }
    });

    await on(page).detail.do.addPhotos(PHOTOS.untagged);
    await expect(on(page).detail.locators.photos.errorTiles).toHaveCount(1);
    await expect(on(page).detail.locators.photos.retryButtons).toHaveCount(1);

    await on(page).detail.do.retryPhoto();
    await expect(on(page).detail.locators.photos.thumbnails).toHaveCount(1);
    await expect(on(page).detail.locators.photos.errorTiles).toHaveCount(0);
  });
});
