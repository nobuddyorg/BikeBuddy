import { buddyTest, expect } from '../pages/buddy-test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Full-stack: runs against the real backend (Functions + Cosmos emulator +
// Azurite) behind the SWA proxy. devMode + SKIP_AUTH provide a local dev user.

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLE_JPG = resolve(here, '../fixtures/sample.jpg');

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
