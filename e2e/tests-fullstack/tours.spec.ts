import { test, expect } from '@playwright/test';
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

test('tour lifecycle: upload → list → detail → image → delete', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#user-menu')).toBeVisible(); // real /api/me login

  const tourName = `CI E2E ${Date.now()}`;

  // Upload a GPX through the modal → real POST /api/tours/upload.
  await page.locator('#btn-upload').click();
  await page.locator('#upload-name').fill(tourName);
  await page.locator('#upload-file').setInputFiles({
    name: 'ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(GPX),
  });
  await expect(page.locator('#btn-submit-upload')).toBeEnabled();
  await page.locator('#btn-submit-upload').click();

  // Appears in the list and opens in the detail panel.
  await expect(page.locator('#tour-list')).toContainText(tourName);
  await expect(page.locator('#detail-name')).toHaveText(tourName);

  // Upload an image → real POST .../images → thumbnail appears.
  await page.locator('#image-file').setInputFiles(SAMPLE_JPG);
  await expect(page.locator('#tour-image-grid .image-thumb')).toHaveCount(1);

  // Delete the tour (confirm dialog) → disappears from the list.
  page.on('dialog', (d) => d.accept());
  await page.locator('#btn-delete-tour').click();
  await expect(page.locator('#tour-list')).not.toContainText(tourName);
});
