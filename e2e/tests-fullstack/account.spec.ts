import { buddyTest, expect } from '../pages/buddy-test';
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

buddyTest.describe('account data (GDPR)', () => {
  buddyTest.beforeEach(async () => {
    await clearUsers();
    await clearTours();
  });

  buddyTest('export downloads JSON; delete removes all user data', async ({ on, page }) => {
    await page.goto('/');
    await expect(on(page).main.locators.userMenu).toBeVisible();
    await on(page).main.do.uploadGpx({ name: 'Account Tour', gpx: GPX });

    await on(page).main.do.openProfile();
    await expect(on(page).modal.profile()).toBeVisible();

    // Export → a JSON file download.
    const downloadPromise = page.waitForEvent('download');
    await on(page).modal.profile.do.exportData();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('bikebuddy-export.json');

    // Delete account (auto-accepts the confirm) → signed out, DB emptied.
    await on(page).modal.profile.do.deleteAccount();
    await expect(on(page).main.locators.buttons.login).toBeVisible();
    await expect(on(page).main.locators.userMenu).toBeHidden();

    expect(await listUsers()).toHaveLength(0);
  });
});
