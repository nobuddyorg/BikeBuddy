import { test, expect, type Page } from '@playwright/test';
import { clearUsers, clearTours, listUsers } from './usersDb';

// GDPR account export + deletion against the real backend (#117).

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Account Tour</name></metadata>
  <trk><trkseg>
    <trkpt lat="48.1" lon="11.5"/>
    <trkpt lat="48.2" lon="11.6"/>
  </trkseg></trk>
</gpx>`;

async function uploadTour(page: Page) {
  await page.locator('#btn-upload').click();
  await page.locator('#upload-name').fill('Account Tour');
  await page.locator('#upload-file').setInputFiles({
    name: 'ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(GPX),
  });
  await expect(page.locator('#btn-submit-upload')).toBeEnabled();
  await page.locator('#btn-submit-upload').click();
  await expect(page.locator('#tour-list')).toContainText('Account Tour');
}

test.describe('account data (GDPR)', () => {
  test.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  test('export downloads JSON; delete removes all user data', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();
    await uploadTour(page);

    await page.locator('#btn-profile').click();
    await expect(page.locator('#profile-modal')).toBeVisible();

    // Export → a JSON file download.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-data').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('bikebuddy-export.json');

    // Delete account (auto-accept the confirm) → signed out, DB emptied.
    page.on('dialog', (d) => d.accept());
    await page.locator('#btn-delete-account').click();
    await expect(page.locator('#btn-login')).toBeVisible();
    await expect(page.locator('#user-menu')).toBeHidden();

    expect(await listUsers()).toHaveLength(0);
  });
});
