import { test, expect, type Page } from '@playwright/test';
import { clearUsers, clearTours } from './usersDb';

// Use-case journeys against the real backend (#103): editing a tour and the
// profile showing the provisioned account (email + join date).

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Journey Tour</name><time>2026-05-01T10:00:00Z</time></metadata>
  <trk><trkseg>
    <trkpt lat="48.1351" lon="11.5820"/>
    <trkpt lat="48.1361" lon="11.5830"/>
  </trkseg></trk>
</gpx>`;

async function uploadTour(page: Page, name: string) {
  await page.locator('#btn-upload').click();
  await page.locator('#upload-name').fill(name);
  await page.locator('#upload-file').setInputFiles({
    name: 'ride.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(GPX),
  });
  await expect(page.locator('#btn-submit-upload')).toBeEnabled();
  await page.locator('#btn-submit-upload').click();
}

test.describe('user journeys', () => {
  test.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  test('edit a tour: rename updates the list and detail panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();
    await uploadTour(page, 'Original Name');

    // Upload auto-selects the new tour → detail panel open.
    await expect(page.locator('#detail-name')).toHaveText('Original Name');

    await page.locator('#btn-edit-tour').click();
    await expect(page.locator('#edit-modal')).toBeVisible();
    await page.locator('#edit-name').fill('Renamed Tour');
    await page.locator('#edit-description').fill('Now with a description');
    await page.locator('#btn-submit-edit').click();

    await expect(page.locator('#edit-modal')).toBeHidden();
    await expect(page.locator('#detail-name')).toHaveText('Renamed Tour');
    await expect(page.locator('#detail-description')).toHaveText('Now with a description');
    await expect(page.locator('#tour-list')).toContainText('Renamed Tour');
    await expect(page.locator('#tour-list')).not.toContainText('Original Name');
  });

  test('edit display name updates the avatar initials and persists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();

    await page.locator('#btn-profile').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await page.locator('#profile-name-input').fill('Alpine Rider');
    await page.locator('#profile-name-form button[type="submit"]').click();

    // Avatar shows first+last initials: "Alpine Rider" → "AR".
    await expect(page.locator('#btn-profile')).toHaveText('AR');

    // Reopen → the name persisted (input + title).
    await page.locator('#btn-close-profile').click();
    await page.locator('#btn-profile').click();
    await expect(page.locator('#profile-name-input')).toHaveValue('Alpine Rider');
    await expect(page.locator('#profile-modal-title')).toHaveText('Alpine Rider');
  });

  test('profile shows the provisioned email and a real join date', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#user-menu')).toBeVisible();

    await page.locator('#btn-profile').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await expect(page.locator('#profile-email')).toContainText('@');
    // "Member since" must be a real date, not the "—" placeholder (#98).
    await expect(page.locator('#profile-since')).not.toHaveText('—');
  });
});
