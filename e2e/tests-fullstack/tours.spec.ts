import { buddyTest, expect } from '../pages/buddy-test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// Full-stack: runs against the real backend (Functions + Cosmos emulator +
// Azurite) behind the SWA proxy. devMode + SKIP_AUTH provide a local dev user.

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_JPG = resolve(here, '../fixtures/sample.jpg');
const SAMPLE_JPG_BUFFER = readFileSync(SAMPLE_JPG);

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>CI E2E Tour</name><time>2026-06-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
    <trkpt lat="48.1371" lon="11.5840"/>
  </trkseg></trk>
</gpx>`;

buddyTest('tour lifecycle: upload → list → detail → image → delete', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible(); // real /api/me login

  const tourName = `CI E2E ${Date.now()}`;

  // Upload a GPX through the modal → real POST /api/tours/upload (asserts it
  // lands in the list), then it opens in the detail panel.
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).main.locators.detail.name).toHaveText(tourName);

  // Upload an image → real POST .../images → thumbnail appears.
  await on(page).main.do.addImage(SAMPLE_JPG);
  await expect(on(page).main.locators.image.thumbs).toHaveCount(1);

  // Delete the tour (confirm dialog) → disappears from the list.
  await on(page).main.do.deleteTour();
  await expect(on(page).main.locators.list.container).not.toContainText(tourName);
});

buddyTest('multi-image upload: per-file success and error handling', async ({ on, page }) => {
  await page.goto('/');
  await expect(on(page).main.locators.userMenu).toBeVisible();

  const tourName = `CI E2E Multi ${Date.now()}`;
  await on(page).main.do.uploadGpx({ name: tourName, gpx: GPX });
  await expect(on(page).main.locators.detail.name).toHaveText(tourName);

  // Two valid images + one invalid file dropped in the same selection.
  // setInputFiles needs a uniform array shape, so every entry — including the
  // valid photos — is passed as a { name, mimeType, buffer } payload.
  await on(page).main.do.addImage([
    { name: 'photo1.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPG_BUFFER },
    { name: 'photo2.jpg', mimeType: 'image/jpeg', buffer: SAMPLE_JPG_BUFFER },
    { name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
  ]);

  // The invalid file never hits the network: it's an error tile immediately,
  // with only a dismiss button (not retryable).
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(1);
  await expect(on(page).main.locators.image.retryButtons).toHaveCount(0);

  // Both valid uploads complete (capped-concurrency pool still finishes all).
  await expect(on(page).main.locators.image.thumbs).toHaveCount(2);
  await expect(on(page).main.locators.image.pendingTiles).toHaveCount(0);

  // Dismissing the error tile removes it.
  await on(page).main.do.dismissImageError();
  await expect(on(page).main.locators.image.errorTiles).toHaveCount(0);
});
