import { buddyTest, expect } from '../pages/buddy-test';
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

buddyTest.describe('user journeys', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  buddyTest('edit a tour: rename updates the list and detail panel', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await on(page).main.do.uploadGpx({ name: 'Original Name', gpx: GPX });

    // Upload auto-selects the new tour → detail panel open.
    await expect(on(page).main.locators.detail.name).toHaveText('Original Name');

    await on(page).main.do.openEdit();
    await expect(on(page).modal.edit()).toBeVisible();
    await on(page).modal.edit.do.setName('Renamed Tour');
    await on(page).modal.edit.do.setDescription('Now with a description');
    await on(page).modal.edit.do.submit();

    await expect(on(page).modal.edit()).toBeHidden();
    await expect(on(page).main.locators.detail.name).toHaveText('Renamed Tour');
    await expect(on(page).main.locators.detail.description).toHaveText('Now with a description');
    await expect(on(page).main.locators.list.container).toContainText('Renamed Tour');
    await expect(on(page).main.locators.list.container).not.toContainText('Original Name');
  });

  buddyTest('edit display name updates the avatar initials and persists', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();
    await on(page).modal.profile.do.setName('Alpine Rider');
    await on(page).modal.profile.do.saveName();

    // Avatar shows first+last initials: "Alpine Rider" → "AR".
    await expect(on(page).main.locators.buttons.profile).toHaveText('AR');

    // Reopen → the name persisted (input + title).
    await on(page).modal.profile.do.close();
    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile.locators.nameInput).toHaveValue('Alpine Rider');
    await expect(on(page).modal.profile.locators.title).toHaveText('Alpine Rider');
  });

  buddyTest('profile shows the provisioned email and a real join date', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();

    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();
    await expect(on(page).modal.profile.locators.email).toContainText('@');
    // "Member since" must be a real date, not the "—" placeholder (#98).
    await expect(on(page).modal.profile.locators.since).not.toHaveText('—');
  });
});
