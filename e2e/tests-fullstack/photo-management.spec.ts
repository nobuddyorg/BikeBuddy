import { buddyTest, expect } from '../pages/buddy-test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Full-stack: runs against the real backend (Functions + Cosmos emulator +
// Azurite) behind the SWA proxy. devMode + SKIP_AUTH provide a local dev user.
//
// Covers photo-management flows the other specs don't: deleting a single
// photo, the lightbox, and retrying a failed upload — none of these were
// previously exercised end-to-end (#292).

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_JPG = resolve(here, '../fixtures/sample.jpg');

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Photo Mgmt Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

buddyTest(
  'deletes a single photo, leaving the rest of the gallery intact',
  async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    const tourName = `Photo Delete ${Date.now()}`;
    await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
    await on(page).main.do.addImage(SAMPLE_JPG);
    await on(page).main.do.addImage(SAMPLE_JPG);
    await expect(on(page).main.locators.image.thumbs).toHaveCount(2);

    await on(page).main.do.deleteImage(0);
    await expect(on(page).main.locators.image.thumbs).toHaveCount(1);
  },
);

buddyTest('opens and closes the lightbox for a photo', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `Lightbox ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await on(page).main.do.addImage(SAMPLE_JPG);
  await expect(on(page).main.locators.image.thumbs).toHaveCount(1);

  await expect(on(page).main.locators.lightbox.root).toBeHidden();
  await on(page).main.do.openLightbox(0);
  await expect(on(page).main.locators.lightbox.root).toBeVisible();
  await expect(on(page).main.locators.lightbox.img).toHaveAttribute('src', /.+/);

  await on(page).main.do.closeLightbox();
  await expect(on(page).main.locators.lightbox.root).toBeHidden();
});

buddyTest('retries a failed upload and it succeeds the second time', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `Retry Upload ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });

  // Fail only the first upload attempt (simulates a transient server error);
  // the retry click goes through the real backend and succeeds.
  let attempt = 0;
  await page.route('**/api/tours/*/images', async (route) => {
    attempt++;
    if (attempt === 1) {
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    } else {
      await route.continue();
    }
  });

  await on(page).main.do.addImage(SAMPLE_JPG);
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(1);
  await expect(on(page).main.locators.image.retryButtons).toHaveCount(1);

  await on(page).main.do.retryImage();
  await expect(on(page).main.locators.image.thumbs).toHaveCount(1);
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(0);
});
